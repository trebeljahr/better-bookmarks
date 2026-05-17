import { ulid } from "ulid";
import type { Bookmark } from "../../shared/types";
import { canonicalize } from "../canonicalizer";
import { dedupTags, getBookmarkByCanonicalUrl } from "../storage/bookmarks";
import { getDB } from "../storage/db";
import { ancestorFolderNames } from "./folderMirror";
import { upsertMapping } from "./mapping";

/**
 * Idempotent walk of the Chrome bookmarks tree. Used on first run and
 * by drift reconciliation. Safe to call repeatedly — never creates
 * duplicates, only merges.
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

  for (const node of Object.values(all)) {
    if (!node.url) {
      await upsertMapping({
        chromeId: node.id,
        bookmarkId: null,
        isFolder: true,
        parentChromeId: node.parentId ?? null,
        lastKnownTitle: node.title ?? "",
        lastKnownUrl: "",
        lastKnownParentId: node.parentId ?? null,
        eventAt: now(),
      });
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

    await db.transaction("rw", db.bookmarks, db.chromeMappings, async () => {
      const existing = await getBookmarkByCanonicalUrl(c.canonical);
      if (existing) {
        const mergedTags = dedupTags([...existing.tags, ...folderTags]);
        const merged: Bookmark = {
          ...existing,
          tags: mergedTags,
          updatedAt: now(),
        };
        await db.bookmarks.put(merged);
        await upsertMapping({
          chromeId: node.id,
          bookmarkId: existing.id,
          isFolder: false,
          parentChromeId: node.parentId ?? null,
          lastKnownTitle: node.title ?? "",
          lastKnownUrl: node.url ?? "",
          lastKnownParentId: node.parentId ?? null,
          eventAt: node.dateAdded ?? now(),
        });
        report.bookmarksMerged += 1;
        report.mappingsWritten += 1;
        return;
      }
      const fresh: Bookmark = {
        id: ulid(node.dateAdded ?? now()),
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
        createdAt: node.dateAdded ?? now(),
        updatedAt: now(),
        capturedFrom: "chrome-import",
      };
      await db.bookmarks.put(fresh);
      await upsertMapping({
        chromeId: node.id,
        bookmarkId: fresh.id,
        isFolder: false,
        parentChromeId: node.parentId ?? null,
        lastKnownTitle: node.title ?? "",
        lastKnownUrl: node.url ?? "",
        lastKnownParentId: node.parentId ?? null,
        eventAt: node.dateAdded ?? now(),
      });
      report.bookmarksCreated += 1;
      report.mappingsWritten += 1;
    });
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
