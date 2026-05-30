/**
 * Folder helpers backed by the `chromeMappings` table.
 *
 * Chrome's bookmark tree gives every folder a stable id and a parentId.
 * We persist that shape in `chromeMappings` (rows with `isFolder = true`)
 * during initial import and incremental sync. These helpers expose that
 * shape to the UI so the sidebar can render the real Chrome folder tree
 * — not just the flat tags inferred from folder names.
 */

import type { ChromeMapping } from "../../shared/types";
import { getDB } from "./db";

/** Chrome assigns "0" to the absolute root; nothing visible lives there. */
export const CHROME_ROOT_ID = "0";

export type FolderNode = {
  chromeId: string;
  title: string;
  parentChromeId: string | null;
  children: FolderNode[];
};

export async function listFolders(): Promise<ChromeMapping[]> {
  const db = getDB();
  return db.chromeMappings.filter((m) => m.isFolder).toArray();
}

/**
 * Build a forest of folder nodes rooted at the top-level Chrome containers
 * (Bookmarks bar, Other bookmarks, Mobile bookmarks). The absolute root
 * (chromeId "0") and any folders whose parent is missing are skipped.
 *
 * Folders are sorted alphabetically at every level.
 */
export function buildFolderForest(folders: ChromeMapping[]): FolderNode[] {
  const byId = new Map<string, ChromeMapping>();
  for (const f of folders) {
    if (f.chromeId === CHROME_ROOT_ID) continue;
    byId.set(f.chromeId, f);
  }
  const childrenByParent = new Map<string, ChromeMapping[]>();
  const roots: ChromeMapping[] = [];
  for (const f of byId.values()) {
    const parentId = f.parentChromeId;
    if (parentId && parentId !== CHROME_ROOT_ID && byId.has(parentId)) {
      const list = childrenByParent.get(parentId);
      if (list) list.push(f);
      else childrenByParent.set(parentId, [f]);
    } else {
      roots.push(f);
    }
  }
  function toNode(f: ChromeMapping): FolderNode {
    const kids = childrenByParent.get(f.chromeId) ?? [];
    return {
      chromeId: f.chromeId,
      title: f.lastKnownTitle,
      parentChromeId: f.parentChromeId,
      children: kids
        .slice()
        .sort((a, b) => a.lastKnownTitle.localeCompare(b.lastKnownTitle))
        .map(toNode),
    };
  }
  return roots
    .slice()
    .sort((a, b) => a.lastKnownTitle.localeCompare(b.lastKnownTitle))
    .map(toNode);
}

/**
 * Set of `chromeId`s in the subtree rooted at `folderChromeId`, inclusive.
 * Bookmarks whose mapping points anywhere in this set are considered
 * "inside" the folder.
 */
export function collectFolderSubtreeIds(
  folderChromeId: string,
  allMappings: ChromeMapping[],
): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const m of allMappings) {
    if (!m.isFolder) continue;
    const parent = m.parentChromeId;
    if (!parent) continue;
    const list = childrenByParent.get(parent);
    if (list) list.push(m.chromeId);
    else childrenByParent.set(parent, [m.chromeId]);
  }
  const out = new Set<string>();
  const stack: string[] = [folderChromeId];
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || out.has(id)) continue;
    out.add(id);
    const kids = childrenByParent.get(id);
    if (kids) for (const k of kids) stack.push(k);
  }
  return out;
}

/**
 * Resolve `folder:<chromeId>` filter tokens to the bookmark IDs that live
 * anywhere in those folders' subtrees. Called from the search runner.
 * Returns null when no folder filter is active.
 */
export async function bookmarkIdsInFolders(folderIds: string[]): Promise<Set<string> | null> {
  if (folderIds.length === 0) return null;
  const db = getDB();
  const allMappings = await db.chromeMappings.toArray();
  const subtree = new Set<string>();
  for (const id of folderIds) {
    for (const c of collectFolderSubtreeIds(id, allMappings)) subtree.add(c);
  }
  const ids = new Set<string>();
  for (const m of allMappings) {
    if (m.isFolder) continue;
    if (!m.bookmarkId) continue;
    if (m.parentChromeId && subtree.has(m.parentChromeId)) ids.add(m.bookmarkId);
  }
  return ids;
}

/**
 * Per-folder bookmark count (recursive, includes descendants). Result is
 * keyed by chromeId.
 */
export async function folderBookmarkCounts(): Promise<Record<string, number>> {
  const db = getDB();
  const allMappings = await db.chromeMappings.toArray();

  // Build child index once.
  const childrenByParent = new Map<string, string[]>();
  for (const m of allMappings) {
    if (!m.isFolder) continue;
    const parent = m.parentChromeId;
    if (!parent) continue;
    const list = childrenByParent.get(parent);
    if (list) list.push(m.chromeId);
    else childrenByParent.set(parent, [m.chromeId]);
  }

  // Direct (non-recursive) bookmark count per folder, deduping by bookmarkId
  // so duplicate Chrome rows pointing at the same store bookmark only count
  // once per folder.
  const directIds = new Map<string, Set<string>>();
  for (const m of allMappings) {
    if (m.isFolder) continue;
    if (!m.bookmarkId) continue;
    if (!m.parentChromeId) continue;
    let set = directIds.get(m.parentChromeId);
    if (!set) {
      set = new Set<string>();
      directIds.set(m.parentChromeId, set);
    }
    set.add(m.bookmarkId);
  }

  // Post-order accumulation: each folder's recursive set = its direct ids
  // ∪ all descendants' recursive sets.
  const recursive = new Map<string, Set<string>>();
  function walk(folderId: string): Set<string> {
    const cached = recursive.get(folderId);
    if (cached) return cached;
    const own = new Set<string>(directIds.get(folderId) ?? []);
    const kids = childrenByParent.get(folderId) ?? [];
    for (const k of kids) {
      for (const id of walk(k)) own.add(id);
    }
    recursive.set(folderId, own);
    return own;
  }

  const counts: Record<string, number> = {};
  for (const m of allMappings) {
    if (!m.isFolder) continue;
    counts[m.chromeId] = walk(m.chromeId).size;
  }
  return counts;
}
