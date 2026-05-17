import type { Tag } from "../../shared/types";
import { getDB } from "../storage/db";

/**
 * Returns the leaf folder names along the Chrome bookmark ancestor
 * chain, excluding the top-level synthetic roots (`Bookmarks bar`,
 * `Other bookmarks`, `Mobile bookmarks`).
 *
 * The list is ordered leaf-first, so the most specific folder name
 * comes first. Suitable for deriving tags at import time.
 */
export const SYNTHETIC_ROOT_TITLES: ReadonlySet<string> = new Set([
  "Bookmarks bar",
  "Bookmarks Bar",
  "Other bookmarks",
  "Other Bookmarks",
  "Mobile bookmarks",
  "Mobile Bookmarks",
]);

export function ancestorFolderNames(
  startId: string | undefined,
  byId: Record<string, chrome.bookmarks.BookmarkTreeNode>,
): string[] {
  const names: string[] = [];
  let cursor = startId ? byId[startId] : undefined;
  while (cursor?.parentId) {
    if (cursor.title && !SYNTHETIC_ROOT_TITLES.has(cursor.title)) {
      names.push(cursor.title);
    }
    cursor = cursor.parentId ? byId[cursor.parentId] : undefined;
  }
  return names;
}

export async function findTagsMirroringFolder(folderId: string): Promise<Tag[]> {
  return getDB()
    .tags.filter((t) => t.mirrorFolderId === folderId)
    .toArray();
}

export async function setTagMirror(tagName: string, folderId: string | null): Promise<void> {
  const db = getDB();
  await db.transaction("rw", db.tags, async () => {
    const tag = await db.tags.where("lowercaseName").equals(tagName.toLowerCase()).first();
    if (!tag) return;
    await db.tags.put({ ...tag, mirrorFolderId: folderId });
  });
}

export async function listMirroredTags(): Promise<Tag[]> {
  return getDB()
    .tags.filter((t) => t.mirrorFolderId !== null)
    .toArray();
}
