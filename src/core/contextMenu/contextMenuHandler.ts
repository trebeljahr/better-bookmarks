/**
 * Chrome contextMenus integration.
 *
 * Registers three menu items reachable from a page or a link:
 *   - "Add to Better Bookmarks"               (id: bb-add)
 *   - "Add to Better Bookmarks (with note)"   (id: bb-add-with-note)
 *   - "Tag…" submenu with the top 8 most-used tags
 *     (children id: bb-tag:<tagName>)
 *
 * The Tag… submenu is rebuilt whenever bookmarks or tags change, debounced
 * to once per 500ms. Build resilience: removeAll + recreate so we never
 * trip Chrome's "duplicate id" error on hot reloads.
 */

import { listBookmarks, upsertBookmark } from "../storage/bookmarks";
import { getDB } from "../storage/db";

export const TAG_MENU_LIMIT = 8;
export const REBUILD_DEBOUNCE_MS = 500;

const ROOT_ADD = "bb-add";
const ROOT_ADD_WITH_NOTE = "bb-add-with-note";
const TAG_PARENT = "bb-tag-parent";
const TAG_CHILD_PREFIX = "bb-tag:";

export type TopTagsSource = () => Promise<string[]>;

export async function computeTopTags(limit: number = TAG_MENU_LIMIT): Promise<string[]> {
  const bookmarks = await listBookmarks();
  const counts = new Map<string, number>();
  for (const b of bookmarks) {
    for (const tag of b.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  const sorted = Array.from(counts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });
  return sorted.slice(0, limit).map(([name]) => name);
}

export async function buildContextMenus(
  topTagsSource: TopTagsSource = computeTopTags,
): Promise<void> {
  await new Promise<void>((resolve) => chrome.contextMenus.removeAll(() => resolve()));

  chrome.contextMenus.create({
    id: ROOT_ADD,
    title: "Add to Better Bookmarks",
    contexts: ["page", "link"],
  });
  chrome.contextMenus.create({
    id: ROOT_ADD_WITH_NOTE,
    title: "Add to Better Bookmarks (with note)",
    contexts: ["page", "link"],
  });

  const tags = await topTagsSource();
  if (tags.length === 0) return;

  chrome.contextMenus.create({
    id: TAG_PARENT,
    title: "Tag…",
    contexts: ["page", "link"],
  });
  for (const name of tags) {
    chrome.contextMenus.create({
      id: `${TAG_CHILD_PREFIX}${name}`,
      parentId: TAG_PARENT,
      title: name,
      contexts: ["page", "link"],
    });
  }
}

export type ClickArgs = {
  info: chrome.contextMenus.OnClickData;
  tab: chrome.tabs.Tab | undefined;
};

export async function handleContextMenuClick({ info, tab }: ClickArgs): Promise<void> {
  const id = String(info.menuItemId);
  const isAdd = id === ROOT_ADD;
  const isAddWithNote = id === ROOT_ADD_WITH_NOTE;
  const isTag = id.startsWith(TAG_CHILD_PREFIX);
  if (!isAdd && !isAddWithNote && !isTag) return;

  const onLink = typeof info.linkUrl === "string" && info.linkUrl.length > 0;
  const rawUrl = onLink ? (info.linkUrl as string) : (tab?.url ?? "");
  if (!rawUrl) return;
  const title = onLink ? (info.selectionText ?? "").trim() : (tab?.title ?? "").trim();

  const tagName = isTag ? id.slice(TAG_CHILD_PREFIX.length) : undefined;
  const tags = tagName ? [tagName] : undefined;

  await upsertBookmark({
    rawUrl,
    title,
    tags,
    capturedFrom: "manual",
  });

  if (isAddWithNote && typeof chrome.action?.openPopup === "function") {
    try {
      await chrome.action.openPopup();
    } catch (err) {
      console.warn("openPopup after context-menu add failed", err);
    }
  }
}

export function installContextMenu(): void {
  void buildContextMenus().catch((err) => console.error("buildContextMenus failed", err));

  let timer: ReturnType<typeof setTimeout> | null = null;
  const scheduleRebuild = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      buildContextMenus().catch((err) => console.error("buildContextMenus failed", err));
    }, REBUILD_DEBOUNCE_MS);
  };

  const db = getDB();
  db.bookmarks.hook("creating", scheduleRebuild);
  db.bookmarks.hook("updating", scheduleRebuild);
  db.bookmarks.hook("deleting", scheduleRebuild);
  db.tags.hook("creating", scheduleRebuild);
  db.tags.hook("updating", scheduleRebuild);
  db.tags.hook("deleting", scheduleRebuild);

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    handleContextMenuClick({ info, tab }).catch((err) =>
      console.error("handleContextMenuClick failed", err),
    );
  });
}
