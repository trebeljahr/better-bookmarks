import type { Bookmark } from "../../shared/types";
import { getDB } from "../storage/db";
import { listMirroredTags } from "./folderMirror";
import { inFlightCreateKey } from "./handlers";
import { inFlight } from "./inFlight";
import { getMappingsByBookmarkId, upsertMapping } from "./mapping";

const DEFAULT_FOLDER_NAME = "Better Bookmarks";

/**
 * Push a freshly-created bookmark into the Chrome tree.
 *
 * Chooses the target folder by inspecting the bookmark's tags. If any
 * tag has a mirror folder, the most-recently-created mirrored tag's
 * folder wins. Otherwise we fall back to a "Better Bookmarks" folder
 * under the bookmarks bar, creating it on first use.
 */
export async function pushNewBookmarkToChrome(bookmark: Bookmark): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.bookmarks) return;

  const targetFolderId = await resolveTargetFolderId(bookmark);
  inFlight.add(
    "create",
    inFlightCreateKey({ url: bookmark.originalUrl, parentId: targetFolderId }),
  );

  const created = await chrome.bookmarks.create({
    parentId: targetFolderId,
    title: bookmark.title || bookmark.originalUrl,
    url: bookmark.originalUrl,
  });

  await upsertMapping({
    chromeId: created.id,
    bookmarkId: bookmark.id,
    isFolder: false,
    parentChromeId: targetFolderId,
    lastKnownTitle: created.title,
    lastKnownUrl: created.url ?? bookmark.originalUrl,
    lastKnownParentId: targetFolderId,
  });
}

export async function pushBookmarkUpdateToChrome(bookmark: Bookmark): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.bookmarks) return;
  const mappings = await getMappingsByBookmarkId(bookmark.id);
  for (const mapping of mappings) {
    if (mapping.isFolder) continue;

    const titleChanged = mapping.lastKnownTitle !== bookmark.title;
    const urlChanged = mapping.lastKnownUrl !== bookmark.originalUrl;
    if (!titleChanged && !urlChanged) continue;

    inFlight.add("update", mapping.chromeId);
    await chrome.bookmarks.update(mapping.chromeId, {
      ...(titleChanged ? { title: bookmark.title } : {}),
      ...(urlChanged ? { url: bookmark.originalUrl } : {}),
    });
    await upsertMapping({
      chromeId: mapping.chromeId,
      bookmarkId: bookmark.id,
      isFolder: false,
      parentChromeId: mapping.parentChromeId,
      lastKnownTitle: bookmark.title,
      lastKnownUrl: bookmark.originalUrl,
      lastKnownParentId: mapping.lastKnownParentId,
    });
  }
}

export async function pushBookmarkDeleteToChrome(bookmarkId: string): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.bookmarks) return;
  const mappings = await getMappingsByBookmarkId(bookmarkId);
  for (const mapping of mappings) {
    inFlight.add("remove", mapping.chromeId);
    try {
      await chrome.bookmarks.remove(mapping.chromeId);
    } catch (err) {
      console.error("chrome.bookmarks.remove failed", err);
    }
  }
}

async function resolveTargetFolderId(bookmark: Bookmark): Promise<string> {
  const mirrored = await listMirroredTags();
  const matchingMirrors = mirrored.filter((t) => bookmark.tags.includes(t.name));
  if (matchingMirrors.length > 0) {
    const sorted = matchingMirrors.sort((a, b) => b.createdAt - a.createdAt);
    const target = sorted[0];
    if (target.mirrorFolderId) return target.mirrorFolderId;
  }
  return ensureDefaultFolder();
}

const DEFAULT_FOLDER_KEY = "__bb_default_folder__";

async function ensureDefaultFolder(): Promise<string> {
  if (typeof chrome === "undefined" || !chrome.bookmarks) {
    throw new Error("chrome.bookmarks unavailable");
  }
  const cached = await chrome.storage?.local?.get?.(DEFAULT_FOLDER_KEY);
  const cachedId = cached?.[DEFAULT_FOLDER_KEY] as string | undefined;
  if (cachedId) {
    try {
      const node = await chrome.bookmarks.get(cachedId);
      if (node?.[0]) return cachedId;
    } catch {
      // fall through
    }
  }
  const tree = await chrome.bookmarks.getTree();
  const bar = tree[0]?.children?.find((n) => n.id === "1" || /Bookmarks/i.test(n.title ?? ""));
  const parentId = bar?.id ?? "1";
  const existing = bar?.children?.find((n) => !n.url && n.title === DEFAULT_FOLDER_NAME);
  if (existing) {
    await chrome.storage?.local?.set?.({ [DEFAULT_FOLDER_KEY]: existing.id });
    return existing.id;
  }
  const created = await chrome.bookmarks.create({
    parentId,
    title: DEFAULT_FOLDER_NAME,
  });
  await chrome.storage?.local?.set?.({ [DEFAULT_FOLDER_KEY]: created.id });
  return created.id;
}

export async function findOrCreateBookmarkInChrome(bookmark: Bookmark): Promise<void> {
  const mappings = await getMappingsByBookmarkId(bookmark.id);
  if (mappings.length > 0) {
    await pushBookmarkUpdateToChrome(bookmark);
    return;
  }
  await pushNewBookmarkToChrome(bookmark);
}

export function dbForOutboundTests() {
  return getDB();
}
