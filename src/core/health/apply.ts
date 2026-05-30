/**
 * apply / undo for Health actions.
 *
 * `applyFinding` runs the action, captures the pre-mutation state into
 * the in-memory undo buffer, then returns the snapshot id so the UI can
 * surface a 30s undo toast.
 *
 * `undoSnapshot` replays a snapshot from the buffer:
 *   - `db.bookmarks.bulkPut(snapshot.bookmarks)` restores losers and
 *     reverts the survivor.
 *   - `db.chromeMappings.bulkPut(snapshot.chromeMappings)` puts back any
 *     mapping rows the delete path tore down.
 *   - Tag deltas are applied in reverse.
 *   - The Chrome side is NOT re-pushed. We let the user know.
 *
 * See docs/BOOKMARK_HEALTH.md "Undo" and "Merge semantics".
 */
import type { Bookmark, ChromeMapping, ReadStatus, Tag } from "../../shared/types";
import { dedupTags } from "../storage/bookmarks";
import { getDB } from "../storage/db";
import { getMappingsByBookmarkId } from "../sync/mapping";
import type { HealthAction } from "./types";
import { type UndoBuffer, type UndoSnapshot, type UndoTagDelta, undoBuffer } from "./undo";

const MOST_PROGRESSED_RANK: Record<ReadStatus, number> = {
  unread: 0,
  reading: 1,
  read: 2,
  archived: 3,
};

export type ApplyResult = {
  /** The snapshot persisted in the undo buffer. */
  snapshot: UndoSnapshot;
};

export type ApplyOpts = {
  /** Use a different undo buffer (tests). */
  buffer?: UndoBuffer;
  now?: () => number;
};

/**
 * Run the action, snapshot the pre-mutation state, push to undo buffer.
 *
 * The store layer's Dexie hooks fan out Chrome sync; we don't have to
 * special-case sync here. The snapshot captures every affected bookmark
 * + every mapping row that may disappear, so undo can replay locally
 * even after sync pushed deletes through.
 */
export async function applyFinding(
  action: HealthAction,
  opts: ApplyOpts = {},
): Promise<ApplyResult> {
  const buffer = opts.buffer ?? undoBuffer;
  switch (action.type) {
    case "set-title":
      return applySetTitle(action.bookmarkId, action.newTitle, buffer);
    case "add-tag":
      return applyAddTag(action.bookmarkId, action.tag, buffer);
    case "rename-tag":
      return applyRenameTag(action.from, action.to, buffer);
    case "merge-bookmarks":
      return applyMergeBookmarks(action.survivorId, action.loserIds, buffer);
    case "delete-bookmark":
      return applyDeleteBookmark(action.bookmarkId, buffer);
  }
}

/** Replay a snapshot. Returns the snapshot so callers can show a toast. */
export async function undoSnapshot(
  snapshotId: string,
  opts: ApplyOpts = {},
): Promise<UndoSnapshot | undefined> {
  const buffer = opts.buffer ?? undoBuffer;
  const snap = buffer.pop(snapshotId);
  if (!snap) return undefined;
  const db = getDB();
  await db.transaction("rw", db.bookmarks, db.chromeMappings, db.tags, async () => {
    if (snap.bookmarks.length > 0) {
      await db.bookmarks.bulkPut(snap.bookmarks);
    }
    if (snap.chromeMappings.length > 0) {
      await db.chromeMappings.bulkPut(snap.chromeMappings);
    }
    for (const delta of snap.tagDeltas) {
      if (delta.before === null && delta.after !== null) {
        // The action created the tag; undo deletes it.
        await db.tags.delete(delta.after.name);
      } else if (delta.before !== null) {
        // The action mutated or removed the tag; undo restores the prior value.
        if (delta.after && delta.after.name !== delta.before.name) {
          await db.tags.delete(delta.after.name);
        }
        await db.tags.put(delta.before);
      }
    }
  });
  return snap;
}

// ----- set-title ----------------------------------------------------------

async function applySetTitle(
  bookmarkId: string,
  newTitle: string,
  buffer: UndoBuffer,
): Promise<ApplyResult> {
  const db = getDB();
  const now = Date.now();
  const existing = await db.bookmarks.get(bookmarkId);
  if (!existing) throw new Error(`bookmark ${bookmarkId} not found`);
  const mappings = await getMappingsByBookmarkId(bookmarkId);
  const updated: Bookmark = { ...existing, title: newTitle, updatedAt: now };
  await db.bookmarks.put(updated);
  const snapshot = buffer.push({
    label: `Set title on "${existing.title || existing.canonicalUrl}"`,
    bookmarks: [existing],
    chromeMappings: mappings,
    tagDeltas: [],
  });
  return { snapshot };
}

// ----- add-tag ------------------------------------------------------------

async function applyAddTag(
  bookmarkId: string,
  tag: string,
  buffer: UndoBuffer,
): Promise<ApplyResult> {
  const db = getDB();
  const now = Date.now();
  const trimmed = tag.trim();
  if (!trimmed) throw new Error("tag must be non-empty");
  const existing = await db.bookmarks.get(bookmarkId);
  if (!existing) throw new Error(`bookmark ${bookmarkId} not found`);
  const mappings = await getMappingsByBookmarkId(bookmarkId);

  // Ensure the tag row exists.
  const lower = trimmed.toLowerCase();
  const priorTag = (await db.tags.where("lowercaseName").equals(lower).first()) ?? null;
  const tagDeltas: UndoTagDelta[] = [];
  if (!priorTag) {
    const fresh: Tag = {
      name: trimmed,
      lowercaseName: lower,
      parentName: null,
      color: null,
      description: "",
      mirrorFolderId: null,
      createdAt: now,
    };
    await db.tags.put(fresh);
    tagDeltas.push({ name: trimmed, before: null, after: fresh });
  }

  const nextTags = dedupTags([...existing.tags, priorTag?.name ?? trimmed]);
  const updated: Bookmark = { ...existing, tags: nextTags, updatedAt: now };
  await db.bookmarks.put(updated);

  const snapshot = buffer.push({
    label: `Add tag "${priorTag?.name ?? trimmed}"`,
    bookmarks: [existing],
    chromeMappings: mappings,
    tagDeltas,
  });
  return { snapshot };
}

// ----- rename-tag ---------------------------------------------------------

async function applyRenameTag(from: string, to: string, buffer: UndoBuffer): Promise<ApplyResult> {
  const db = getDB();
  const fromLower = from.toLowerCase();
  const toTrimmed = to.trim();
  const toLower = toTrimmed.toLowerCase();
  if (!toTrimmed) throw new Error("rename-tag target must be non-empty");

  const priorFromTag = await db.tags.where("lowercaseName").equals(fromLower).first();
  const priorToTag = await db.tags.where("lowercaseName").equals(toLower).first();

  // Bookmarks carrying the from-tag (case-insensitive).
  const allBookmarks = await db.bookmarks.toArray();
  const affected = allBookmarks.filter((b) => b.tags.some((t) => t.toLowerCase() === fromLower));
  const beforeBookmarks = affected.map((b) => ({ ...b, tags: [...b.tags] }));

  // Apply the rename atomically.
  const now = Date.now();
  const tagDeltas: UndoTagDelta[] = [];
  await db.transaction("rw", db.bookmarks, db.tags, async () => {
    if (priorFromTag) {
      await db.tags.delete(priorFromTag.name);
    }
    let afterFromTag: Tag | null = null;
    if (fromLower !== toLower) {
      if (!priorToTag && priorFromTag) {
        const renamed: Tag = {
          ...priorFromTag,
          name: toTrimmed,
          lowercaseName: toLower,
        };
        await db.tags.put(renamed);
        afterFromTag = renamed;
      }
    }
    if (priorFromTag) {
      tagDeltas.push({
        name: priorFromTag.name,
        before: priorFromTag,
        after: afterFromTag,
      });
    }

    for (const b of affected) {
      const nextTags = dedupTags(
        b.tags.map((t) => (t.toLowerCase() === fromLower ? toTrimmed : t)),
      );
      await db.bookmarks.put({ ...b, tags: nextTags, updatedAt: now });
    }
  });

  // Mappings are not touched by rename — pass an empty array; undo
  // doesn't need to restore mapping rows.
  const snapshot = buffer.push({
    label: `Rename tag "${from}" → "${toTrimmed}"`,
    bookmarks: beforeBookmarks,
    chromeMappings: [],
    tagDeltas,
  });
  return { snapshot };
}

// ----- merge-bookmarks ----------------------------------------------------

async function applyMergeBookmarks(
  survivorId: string,
  loserIds: string[],
  buffer: UndoBuffer,
): Promise<ApplyResult> {
  if (loserIds.length === 0) throw new Error("merge-bookmarks needs at least one loser");
  const db = getDB();
  const survivor = await db.bookmarks.get(survivorId);
  if (!survivor) throw new Error(`survivor ${survivorId} not found`);
  const losers: Bookmark[] = [];
  for (const id of loserIds) {
    const l = await db.bookmarks.get(id);
    if (!l) throw new Error(`loser ${id} not found`);
    losers.push(l);
  }
  const allMappings: ChromeMapping[] = [];
  for (const b of [survivor, ...losers]) {
    const m = await getMappingsByBookmarkId(b.id);
    allMappings.push(...m);
  }

  const merged = mergeRecords(survivor, losers);
  await db.transaction("rw", db.bookmarks, async () => {
    await db.bookmarks.put(merged);
    for (const l of losers) {
      await db.bookmarks.delete(l.id);
    }
  });
  // Loser mapping rows: the Dexie `deleting` hook (when sync is on)
  // will push chrome.bookmarks.remove for each one. We've already
  // captured the pre-delete snapshot above.

  const snapshot = buffer.push({
    label: `Merge of ${losers.length + 1} bookmarks`,
    bookmarks: [survivor, ...losers],
    chromeMappings: allMappings,
    tagDeltas: [],
  });
  return { snapshot };
}

/**
 * Apply the merge rules from docs/BOOKMARK_HEALTH.md "Merge semantics".
 * Pure function — no IO — so we can unit-test the field-by-field rules.
 */
export function mergeRecords(survivor: Bookmark, losers: Bookmark[]): Bookmark {
  const now = Date.now();
  const tags = dedupTags([survivor.tags, ...losers.map((l) => l.tags)].flat());
  const noteParts = [survivor, ...losers].map((b) => b.note.trim()).filter((n) => n.length > 0);
  const note = noteParts.join("\n\n---\n\n");
  const descriptionCandidates = [survivor, ...losers]
    .map((b) => b.description)
    .filter((d) => d.trim().length > 0);
  const description = descriptionCandidates.length
    ? descriptionCandidates.reduce((a, b) => (a.length >= b.length ? a : b), "")
    : survivor.description;
  const title =
    survivor.title.trim().length > 0
      ? survivor.title
      : losers
          .map((l) => l.title)
          .filter((t) => t.trim().length > 0)
          .reduce((a, b) => (a.length >= b.length ? a : b), survivor.title);
  const rating = pickMax(
    [survivor, ...losers].map((b) => b.rating).filter((r): r is number => r !== null),
  );
  const necessaryTime = pickMax(
    [survivor, ...losers].map((b) => b.necessaryTime).filter((n): n is number => n !== null),
  );
  const status: ReadStatus = [survivor, ...losers]
    .map((b) => b.status)
    .reduce((a, b) => (MOST_PROGRESSED_RANK[a] >= MOST_PROGRESSED_RANK[b] ? a : b));
  const readAt = pickMin(
    [survivor, ...losers].map((b) => b.readAt).filter((r): r is number => r !== null),
  );
  const createdAt = Math.min(...[survivor, ...losers].map((b) => b.createdAt));
  return {
    ...survivor,
    title,
    description,
    note,
    tags,
    rating,
    necessaryTime,
    status,
    readAt: readAt === undefined ? null : readAt,
    createdAt,
    updatedAt: now,
  };
}

function pickMax(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => (a >= b ? a : b));
}

function pickMin(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((a, b) => (a <= b ? a : b));
}

// ----- delete-bookmark ----------------------------------------------------

async function applyDeleteBookmark(bookmarkId: string, buffer: UndoBuffer): Promise<ApplyResult> {
  const db = getDB();
  const existing = await db.bookmarks.get(bookmarkId);
  if (!existing) throw new Error(`bookmark ${bookmarkId} not found`);
  const mappings = await getMappingsByBookmarkId(bookmarkId);
  await db.bookmarks.delete(bookmarkId);
  const snapshot = buffer.push({
    label: `Delete "${existing.title || existing.canonicalUrl}"`,
    bookmarks: [existing],
    chromeMappings: mappings,
    tagDeltas: [],
  });
  return { snapshot };
}

// ----- dismissals ---------------------------------------------------------

/** Stable fingerprint used by dismissal storage. Mirrors the spec. */
export function fingerprintForBookmarkIds(bookmarkIds: readonly string[]): string {
  return [...bookmarkIds].sort().join("|");
}

/**
 * Extract the stable fingerprint from a finding's details (scanners set
 * it) or fall back to the bookmark-id-based fingerprint.
 */
export function fingerprintForFinding(finding: {
  bookmarkIds: readonly string[];
  details?: Record<string, unknown>;
}): string {
  const fromDetails = finding.details?.fingerprint;
  if (typeof fromDetails === "string" && fromDetails.length > 0) return fromDetails;
  return fingerprintForBookmarkIds(finding.bookmarkIds);
}
