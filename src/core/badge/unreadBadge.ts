/**
 * Action badge — shows the count of unread bookmarks on the toolbar icon.
 *
 * `refreshUnreadBadge` is the single source of truth; it queries Dexie for
 * the current count, applies the 999+ cap, and writes the badge text +
 * background color. `wireUnreadBadge` subscribes to Dexie hooks so any
 * bookmark mutation triggers a refresh, debounced to once per 500ms so
 * bulk operations don't spam chrome.action.
 */

import { getDB } from "../storage/db";

export const BADGE_BG_COLOR = "#1976d2";
export const BADGE_CAP = 999;
export const BADGE_REFRESH_DEBOUNCE_MS = 500;

export function formatBadgeText(count: number): string {
  if (count <= 0) return "";
  if (count > BADGE_CAP) return `${BADGE_CAP}+`;
  return String(count);
}

export async function countUnread(): Promise<number> {
  return getDB().bookmarks.where("status").equals("unread").count();
}

export async function refreshUnreadBadge(): Promise<void> {
  try {
    const count = await countUnread();
    const text = formatBadgeText(count);
    await chrome.action.setBadgeText({ text });
    if (text) {
      await chrome.action.setBadgeBackgroundColor({ color: BADGE_BG_COLOR });
    }
  } catch (err) {
    console.error("refreshUnreadBadge failed", err);
  }
}

let wired = false;

export function wireUnreadBadge(): void {
  if (wired) return;
  wired = true;

  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      refreshUnreadBadge();
    }, BADGE_REFRESH_DEBOUNCE_MS);
  };

  const db = getDB();
  db.bookmarks.hook("creating", schedule);
  db.bookmarks.hook("updating", schedule);
  db.bookmarks.hook("deleting", schedule);

  void refreshUnreadBadge();
}

export function resetUnreadBadgeWiringForTests(): void {
  wired = false;
}
