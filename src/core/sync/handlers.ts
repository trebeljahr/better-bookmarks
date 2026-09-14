import { ulid } from "@/core/util/ulid";
import type { Bookmark } from "../../shared/types";
import { canonicalize } from "../canonicalizer";
import { dedupTags, getBookmarkByCanonicalUrl, updateBookmark } from "../storage/bookmarks";
import { getDB } from "../storage/db";
import { getSettings } from "../storage/settings";
import { getFieldPolicy } from "./conflictPolicyCache";
import { resolveTitleUrl } from "./conflictResolver";
import { inFlight } from "./inFlight";
import {
  deleteMapping,
  getMappingByChromeId,
  getMappingsByBookmarkId,
  touchEventAt,
  upsertMapping,
} from "./mapping";
import { type ConflictField, enqueueConflict } from "./pendingConflicts";

/**
 * Inbound Chrome bookmark event handlers. These are called from the
 * service worker when chrome.bookmarks.* events fire. Outbound writes
 * to chrome.bookmarks are done by `outbound.ts`.
 *
 * Every handler short-circuits if the event matches an in-flight
 * token (i.e. it's the echo of our own write). When in doubt we
 * additionally compare the inbound payload to the store state and
 * no-op when they already agree.
 */

export type InboundCreate = {
  id: string;
  url?: string;
  title: string;
  parentId?: string;
};

export async function handleCreated(node: InboundCreate, now = Date.now()): Promise<void> {
  if (inFlight.consume("create", inFlightCreateKey(node))) {
    await upsertMapping({
      chromeId: node.id,
      bookmarkId: null,
      isFolder: !node.url,
      parentChromeId: node.parentId ?? null,
      lastKnownTitle: node.title,
      lastKnownUrl: node.url ?? "",
      lastKnownParentId: node.parentId ?? null,
      eventAt: now,
    });
    return;
  }

  if (!node.url) {
    // folder
    await upsertMapping({
      chromeId: node.id,
      bookmarkId: null,
      isFolder: true,
      parentChromeId: node.parentId ?? null,
      lastKnownTitle: node.title,
      lastKnownUrl: "",
      lastKnownParentId: node.parentId ?? null,
      eventAt: now,
    });
    return;
  }

  const c = canonicalize(node.url);
  if (!c.ok) return;

  const db = getDB();
  await db.transaction("rw", db.bookmarks, db.chromeMappings, async () => {
    const existing = await getBookmarkByCanonicalUrl(c.canonical);
    if (existing) {
      await upsertMapping({
        chromeId: node.id,
        bookmarkId: existing.id,
        isFolder: false,
        parentChromeId: node.parentId ?? null,
        lastKnownTitle: node.title,
        lastKnownUrl: node.url ?? "",
        lastKnownParentId: node.parentId ?? null,
        eventAt: now,
      });
      return;
    }

    const fresh: Bookmark = {
      id: ulid(now),
      canonicalUrl: c.canonical,
      originalUrl: node.url ?? "",
      domain: c.domain,
      title: node.title,
      description: node.title,
      note: "",
      tags: [],
      rating: null,
      necessaryTime: null,
      contentType: "unknown",
      language: null,
      status: "unread",
      readAt: null,
      createdAt: now,
      updatedAt: now,
      capturedFrom: "chrome-sync",
    };
    await db.bookmarks.put(fresh);
    await upsertMapping({
      chromeId: node.id,
      bookmarkId: fresh.id,
      isFolder: false,
      parentChromeId: node.parentId ?? null,
      lastKnownTitle: node.title,
      lastKnownUrl: node.url ?? "",
      lastKnownParentId: node.parentId ?? null,
      eventAt: now,
    });
  });
}

export type InboundChanged = {
  id: string;
  title?: string;
  url?: string;
};

export async function handleChanged(node: InboundChanged, now = Date.now()): Promise<void> {
  const echoed = inFlight.consume("update", node.id);
  await touchEventAt(node.id, now);
  if (echoed) return;

  const mapping = await getMappingByChromeId(node.id);
  if (!mapping) return;

  // Folder rename: update the mapping's stored title so the sidebar tree
  // reflects Chrome's new label. Folders carry no bookmarkId, so the
  // earlier short-circuit would otherwise drop these events on the floor.
  if (mapping.isFolder) {
    if (node.title !== undefined && node.title !== mapping.lastKnownTitle) {
      await upsertMapping({
        chromeId: mapping.chromeId,
        bookmarkId: mapping.bookmarkId,
        isFolder: true,
        parentChromeId: mapping.parentChromeId,
        lastKnownTitle: node.title,
        lastKnownUrl: mapping.lastKnownUrl,
        lastKnownParentId: mapping.lastKnownParentId,
        eventAt: now,
      });
    }
    return;
  }

  if (!mapping.bookmarkId) return;

  const db = getDB();
  const bookmark = await db.bookmarks.get(mapping.bookmarkId);
  if (!bookmark) return;

  const settings = await getSettings();
  const nextTitle = node.title ?? mapping.lastKnownTitle;
  const nextUrl = node.url ?? mapping.lastKnownUrl;

  if (settings.conflictPolicy === "ask") {
    await applyAskPolicy(bookmark, { chromeTitle: nextTitle, chromeUrl: nextUrl, now });
  } else {
    const resolution = resolveTitleUrl(
      bookmark,
      { title: nextTitle, url: nextUrl, eventAt: now },
      settings.conflictPolicy,
    );

    let canonical = bookmark.canonicalUrl;
    let originalUrl = bookmark.originalUrl;
    let domain = bookmark.domain;
    if (resolution.source === "chrome" && node.url !== undefined) {
      const c = canonicalize(node.url);
      if (c.ok) {
        canonical = c.canonical;
        originalUrl = node.url;
        domain = c.domain;
      }
    }

    await updateBookmark(bookmark.id, {
      title: resolution.title,
      originalUrl,
      domain,
      ...(canonical !== bookmark.canonicalUrl ? { canonicalUrl: canonical } : {}),
    } as Partial<Bookmark>);
  }

  await upsertMapping({
    chromeId: mapping.chromeId,
    bookmarkId: mapping.bookmarkId,
    isFolder: mapping.isFolder,
    parentChromeId: mapping.parentChromeId,
    lastKnownTitle: nextTitle,
    lastKnownUrl: nextUrl,
    lastKnownParentId: mapping.lastKnownParentId,
    eventAt: now,
  });
}

/**
 * `ask` D2 fallback. For each field that Chrome and the store disagree on
 * we first consult the short-lived per-field policy cache (seeded by the
 * "Apply to all future conflicts on this field for 24h" checkbox in the
 * modal). Cached "chrome" applies Chrome's value silently; cached "store"
 * keeps the store side silently. Fields with no cached directive are
 * enqueued as one `PendingConflictRow` for the overview page to surface.
 */
async function applyAskPolicy(
  bookmark: Bookmark,
  input: { chromeTitle: string; chromeUrl: string; now: number },
): Promise<void> {
  const { chromeTitle, chromeUrl, now } = input;
  const chromeCanonical = canonicalize(chromeUrl);
  const chromeCanonicalUrl = chromeCanonical.ok ? chromeCanonical.canonical : bookmark.canonicalUrl;

  const conflicts: ConflictField[] = [];
  if (chromeTitle !== bookmark.title) conflicts.push("title");
  if (chromeCanonicalUrl !== bookmark.canonicalUrl) conflicts.push("url");
  if (conflicts.length === 0) return;

  const patch: Partial<Bookmark> = {};
  const remaining: ConflictField[] = [];

  for (const field of conflicts) {
    const cached = await getFieldPolicy(field, now);
    if (cached === "chrome") {
      if (field === "title") {
        patch.title = chromeTitle;
      } else if (chromeCanonical.ok) {
        patch.originalUrl = chromeUrl;
        patch.canonicalUrl = chromeCanonical.canonical;
        patch.domain = chromeCanonical.domain;
      }
    } else if (cached === "store") {
      // keep store side silently — no patch needed
    } else {
      remaining.push(field);
    }
  }

  if (Object.keys(patch).length > 0) {
    await updateBookmark(bookmark.id, patch as Partial<Bookmark>);
  }

  if (remaining.length > 0) {
    await enqueueConflict({
      bookmarkId: bookmark.id,
      chromeSide: { title: chromeTitle, url: chromeUrl },
      storeSide: { title: bookmark.title, url: bookmark.originalUrl },
      fields: remaining,
      enqueuedAt: now,
    });
  }
}

export async function handleRemoved(chromeId: string, now = Date.now()): Promise<void> {
  if (inFlight.consume("remove", chromeId)) {
    await deleteMapping(chromeId);
    return;
  }
  const mapping = await getMappingByChromeId(chromeId);
  if (!mapping) return;
  await deleteMapping(chromeId);
  if (!mapping.bookmarkId) return;

  const remaining = await getMappingsByBookmarkId(mapping.bookmarkId);
  if (remaining.length === 0) {
    // Last Chrome reference removed. Keep bookmark in store but flag implicitly
    // by leaving it without any chromeMapping rows. Phase 4+ may add a
    // dedicated `chromeOrphan` flag.
    await updateBookmark(mapping.bookmarkId, { updatedAt: now });
  }
}

export type InboundMoved = {
  id: string;
  parentId: string;
  oldParentId: string;
};

export async function handleMoved(node: InboundMoved, now = Date.now()): Promise<void> {
  if (inFlight.consume("move", node.id)) {
    await touchEventAt(node.id, now);
    return;
  }
  const mapping = await getMappingByChromeId(node.id);
  if (!mapping) return;
  await upsertMapping({
    chromeId: mapping.chromeId,
    bookmarkId: mapping.bookmarkId,
    isFolder: mapping.isFolder,
    parentChromeId: node.parentId,
    lastKnownTitle: mapping.lastKnownTitle,
    lastKnownUrl: mapping.lastKnownUrl,
    lastKnownParentId: node.parentId,
    eventAt: now,
  });

  // Folder-mirror policy reactions (entering/leaving mirrored folders)
  // are handled in folderMirror.ts when integrated with bookmarks. For now,
  // we just record the move.
  if (!mapping.bookmarkId) return;
  const db = getDB();
  const bookmark = await db.bookmarks.get(mapping.bookmarkId);
  if (!bookmark) return;

  const oldMirror = await db.tags.filter((t) => t.mirrorFolderId === node.oldParentId).first();
  const newMirror = await db.tags.filter((t) => t.mirrorFolderId === node.parentId).first();

  const tagsCopy = [...bookmark.tags];
  let touched = false;

  if (oldMirror && tagsCopy.includes(oldMirror.name)) {
    // Only remove if no other Chrome copy still sits in the old mirror folder.
    const stillThere = await isStillInFolder(
      mapping.bookmarkId,
      node.oldParentId,
      mapping.chromeId,
    );
    if (!stillThere) {
      const idx = tagsCopy.indexOf(oldMirror.name);
      tagsCopy.splice(idx, 1);
      touched = true;
    }
  }
  if (newMirror && !tagsCopy.includes(newMirror.name)) {
    tagsCopy.push(newMirror.name);
    touched = true;
  }
  if (touched) {
    await updateBookmark(bookmark.id, { tags: dedupTags(tagsCopy) });
  }
}

async function isStillInFolder(
  bookmarkId: string,
  folderId: string,
  excludeChromeId: string,
): Promise<boolean> {
  const all = await getMappingsByBookmarkId(bookmarkId);
  return all.some((m) => m.chromeId !== excludeChromeId && m.parentChromeId === folderId);
}

export function inFlightCreateKey(node: Pick<InboundCreate, "url" | "parentId">): string {
  return `${node.parentId ?? ""}::${node.url ?? ""}`;
}
