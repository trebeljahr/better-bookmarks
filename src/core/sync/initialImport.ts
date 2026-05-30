import { ulid } from "@/core/util/ulid";
import type { Bookmark, ChromeMapping } from "../../shared/types";
import { canonicalize } from "../canonicalizer";
import { reindexAll, setSearchIndexerSuppressed } from "../search";
import { dedupTags } from "../storage/bookmarks";
import { getDB } from "../storage/db";
import { ancestorFolderNames } from "./folderMirror";

/**
 * Idempotent walk of the Chrome bookmarks tree. Used on first run and by
 * drift reconciliation. Safe to call repeatedly — never creates duplicates,
 * only merges.
 *
 * Perf notes: at the 10k-20k-bookmark scale we target, the naive
 * "one transaction per bookmark with a per-item canonical lookup" pattern
 * costs O(n) Dexie transactions plus O(n) `where().equals().first()`
 * queries — typically tens of seconds in the browser. We instead:
 *
 *   1. Walk the tree once into in-memory work lists.
 *   2. Prefetch every existing bookmark in a single `toArray()` and build a
 *      `Map<canonical, Bookmark>` for O(1) merge lookups.
 *   3. Decide merge / create / mapping work in plain JS.
 *   4. Suppress the search indexer's per-write hook for the duration of the
 *      bulk writes, then run a single `reindexAll()` afterwards.
 *   5. `bulkPut` bookmarks and mappings inside ONE Dexie transaction.
 */

const IMPORT_FLAG = "__bb_initial_import__";

export type ImportReport = {
  bookmarksSeen: number;
  bookmarksCreated: number;
  bookmarksMerged: number;
  mappingsWritten: number;
  rejected: number;
};

function flattenTree(
  root: chrome.bookmarks.BookmarkTreeNode,
): Record<string, chrome.bookmarks.BookmarkTreeNode> {
  const out: Record<string, chrome.bookmarks.BookmarkTreeNode> = {};
  function visit(node: chrome.bookmarks.BookmarkTreeNode) {
    out[node.id] = node;
    node.children?.forEach(visit);
  }
  visit(root);
  return out;
}

function buildMapping(input: {
  chromeId: string;
  bookmarkId: string | null;
  isFolder: boolean;
  parentChromeId: string | null;
  lastKnownTitle: string;
  lastKnownUrl: string;
  lastKnownParentId: string | null;
  eventAt: number;
  now: number;
}): ChromeMapping {
  return {
    chromeId: input.chromeId,
    bookmarkId: input.bookmarkId,
    isFolder: input.isFolder,
    parentChromeId: input.parentChromeId,
    lastSyncedAt: input.now,
    lastKnownEventAt: input.eventAt,
    lastKnownTitle: input.lastKnownTitle,
    lastKnownUrl: input.lastKnownUrl,
    lastKnownParentId: input.lastKnownParentId,
  };
}

export async function importChromeTree(
  trees: chrome.bookmarks.BookmarkTreeNode[],
  now: () => number = Date.now,
): Promise<ImportReport> {
  const report: ImportReport = {
    bookmarksSeen: 0,
    bookmarksCreated: 0,
    bookmarksMerged: 0,
    mappingsWritten: 0,
    rejected: 0,
  };

  const all: Record<string, chrome.bookmarks.BookmarkTreeNode> = {};
  for (const tree of trees) Object.assign(all, flattenTree(tree));

  const db = getDB();

  // Single prefetch: pull every existing bookmark and index by canonical
  // URL. Replaces N per-bookmark `getBookmarkByCanonicalUrl` lookups with
  // one `toArray()` + an in-memory Map.
  const existingByCanonical = new Map<string, Bookmark>();
  for (const b of await db.bookmarks.toArray()) {
    existingByCanonical.set(b.canonicalUrl, b);
  }

  const bookmarksToWrite: Bookmark[] = [];
  const mappingsToWrite: ChromeMapping[] = [];

  for (const node of Object.values(all)) {
    const nowTs = now();

    if (!node.url) {
      mappingsToWrite.push(
        buildMapping({
          chromeId: node.id,
          bookmarkId: null,
          isFolder: true,
          parentChromeId: node.parentId ?? null,
          lastKnownTitle: node.title ?? "",
          lastKnownUrl: "",
          lastKnownParentId: node.parentId ?? null,
          eventAt: nowTs,
          now: nowTs,
        }),
      );
      report.mappingsWritten += 1;
      continue;
    }

    report.bookmarksSeen += 1;
    const url = node.url;
    const c = canonicalize(url);
    if (!c.ok) {
      report.rejected += 1;
      continue;
    }

    const folderTags = ancestorFolderNames(node.parentId, all);
    const existing = existingByCanonical.get(c.canonical);
    const eventAt = node.dateAdded ?? nowTs;

    if (existing) {
      const mergedTags = dedupTags([...existing.tags, ...folderTags]);
      const merged: Bookmark = {
        ...existing,
        tags: mergedTags,
        updatedAt: nowTs,
      };
      bookmarksToWrite.push(merged);
      // Keep the Map current so a later node with the same canonical URL
      // merges into our pending write rather than the stale prefetch.
      existingByCanonical.set(c.canonical, merged);
      mappingsToWrite.push(
        buildMapping({
          chromeId: node.id,
          bookmarkId: existing.id,
          isFolder: false,
          parentChromeId: node.parentId ?? null,
          lastKnownTitle: node.title ?? "",
          lastKnownUrl: node.url ?? "",
          lastKnownParentId: node.parentId ?? null,
          eventAt,
          now: nowTs,
        }),
      );
      report.bookmarksMerged += 1;
      report.mappingsWritten += 1;
      continue;
    }

    const fresh: Bookmark = {
      id: ulid(eventAt),
      canonicalUrl: c.canonical,
      originalUrl: url,
      domain: c.domain,
      title: node.title ?? "",
      description: node.title ?? "",
      note: "",
      tags: dedupTags(folderTags),
      rating: null,
      necessaryTime: null,
      contentType: "unknown",
      language: null,
      status: "unread",
      readAt: null,
      createdAt: eventAt,
      updatedAt: nowTs,
      capturedFrom: "chrome-import",
    };
    bookmarksToWrite.push(fresh);
    existingByCanonical.set(c.canonical, fresh);
    mappingsToWrite.push(
      buildMapping({
        chromeId: node.id,
        bookmarkId: fresh.id,
        isFolder: false,
        parentChromeId: node.parentId ?? null,
        lastKnownTitle: node.title ?? "",
        lastKnownUrl: node.url ?? "",
        lastKnownParentId: node.parentId ?? null,
        eventAt,
        now: nowTs,
      }),
    );
    report.bookmarksCreated += 1;
    report.mappingsWritten += 1;
  }

  // Single transaction with two `bulkPut`s. Search-index hooks are
  // suppressed for the duration; we reindex once at the end so the
  // postings store reflects the final state in one pass.
  setSearchIndexerSuppressed(true);
  try {
    await db.transaction("rw", db.bookmarks, db.chromeMappings, async () => {
      if (bookmarksToWrite.length > 0) {
        await db.bookmarks.bulkPut(bookmarksToWrite);
      }
      if (mappingsToWrite.length > 0) {
        await db.chromeMappings.bulkPut(mappingsToWrite);
      }
    });
  } finally {
    setSearchIndexerSuppressed(false);
  }

  if (bookmarksToWrite.length > 0) {
    try {
      await reindexAll();
    } catch (err) {
      console.error("post-import reindexAll failed", err);
    }
  }

  return report;
}

export async function runInitialImportIfNeeded(): Promise<ImportReport | { alreadyRan: true }> {
  if (typeof chrome === "undefined" || !chrome.bookmarks || !chrome.storage?.local) {
    return {
      bookmarksSeen: 0,
      bookmarksCreated: 0,
      bookmarksMerged: 0,
      mappingsWritten: 0,
      rejected: 0,
    };
  }
  const flag = await chrome.storage.local.get(IMPORT_FLAG);
  if (flag[IMPORT_FLAG]) return { alreadyRan: true };
  const tree = await chrome.bookmarks.getTree();
  const report = await importChromeTree(tree);
  await chrome.storage.local.set({ [IMPORT_FLAG]: { ranAt: Date.now() } });
  return report;
}
