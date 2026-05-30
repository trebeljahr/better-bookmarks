/**
 * Raw Chrome bookmark-tree backup.
 *
 * The existing `runBackupOnce()` snapshots the *extension's IndexedDB* via
 * `exportJson()`. That's fine for restoring tags / ratings / notes, but it
 * does not capture Chrome's own bookmark tree. If a sync bug or a botched
 * dev session corrupts the Chrome side, an extension-DB snapshot can't
 * undo it.
 *
 * This module dumps the raw `chrome.bookmarks.getTree()` result to
 * ~/Downloads, with rolling-N retention. It runs:
 *   - once on every service-worker boot, BEFORE initial import / reconcile
 *   - via the same auto-backup alarm
 *
 * Restore is manual today: open the JSON, walk the tree, recreate via
 * chrome.bookmarks.create. A scripted restore can come later.
 */

import { getSettings } from "../storage/settings";

type DownloadsPromiseApi = {
  search(query: chrome.downloads.DownloadQuery): Promise<chrome.downloads.DownloadItem[]>;
  erase(query: chrome.downloads.DownloadQuery): Promise<number[]>;
  removeFile(id: number): Promise<void>;
  download(options: chrome.downloads.DownloadOptions): Promise<number>;
};
const downloadsApi = (): DownloadsPromiseApi => chrome.downloads as unknown as DownloadsPromiseApi;

export const CHROME_TREE_BACKUP_PREFIX = "chrome-bookmarks-tree-";
export const CHROME_TREE_BACKUP_REGEX = "chrome-bookmarks-tree-.*\\.json";

export type ChromeTreeBackupResult = {
  fileName: string;
  byteSize: number;
  nodeCount: number;
};

export function chromeTreeBackupFileNameFor(now: number): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `${CHROME_TREE_BACKUP_PREFIX}${date}-${time}.json`;
}

function utf8ToBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function countNodes(tree: chrome.bookmarks.BookmarkTreeNode[]): number {
  let n = 0;
  const walk = (node: chrome.bookmarks.BookmarkTreeNode) => {
    n += 1;
    node.children?.forEach(walk);
  };
  tree.forEach(walk);
  return n;
}

/**
 * Snapshot chrome.bookmarks.getTree() to ~/Downloads. Returns null + logs a
 * warning if chrome.bookmarks or chrome.downloads is unavailable (tests,
 * non-extension contexts) so callers never block on backup absence.
 */
export async function runChromeTreeBackupOnce(
  now: number = Date.now(),
): Promise<ChromeTreeBackupResult | null> {
  if (typeof chrome === "undefined" || !chrome.bookmarks || !chrome.downloads) {
    return null;
  }
  const tree = await chrome.bookmarks.getTree();
  const payload = {
    schema: "chrome-bookmarks-tree-v1" as const,
    capturedAt: new Date(now).toISOString(),
    tree,
  };
  const json = JSON.stringify(payload);
  const byteSize = new TextEncoder().encode(json).byteLength;
  const fileName = chromeTreeBackupFileNameFor(now);
  const url = `data:application/json;base64,${utf8ToBase64(json)}`;

  await downloadsApi().download({
    url,
    filename: fileName,
    saveAs: false,
    conflictAction: "uniquify",
  });

  const settings = await getSettings();
  await cleanupOldChromeTreeBackups(settings.autoBackupKeepCount);

  return { fileName, byteSize, nodeCount: countNodes(tree) };
}

export async function cleanupOldChromeTreeBackups(keep: number): Promise<void> {
  if (keep <= 0) return;
  const api = downloadsApi();
  const items = await api.search({ filenameRegex: CHROME_TREE_BACKUP_REGEX });
  const sorted = [...items].sort((a, b) => {
    const at = Date.parse(a.startTime ?? "") || 0;
    const bt = Date.parse(b.startTime ?? "") || 0;
    return bt - at;
  });
  const toDelete = sorted.slice(keep);
  for (const item of toDelete) {
    try {
      await api.removeFile(item.id);
    } catch (err) {
      console.warn("chrome-tree-backup: removeFile failed", item.id, err);
    }
    try {
      await api.erase({ id: item.id });
    } catch (err) {
      console.warn("chrome-tree-backup: erase failed", item.id, err);
    }
  }
}

const FIRST_BOOT_FLAG = "__bb_chrome_tree_backup_first_boot_done__";

/**
 * Best-effort safety snapshot at service-worker boot. Awaited by startSync
 * BEFORE any initial-import / reconcile work, so a fresh on-disk dump always
 * exists before sync touches anything.
 *
 * Subsequent SW boots within the same install also snapshot, but only if the
 * last on-disk dump is older than `minIntervalMs` (default 1h). That keeps
 * dev cycles from spamming ~/Downloads while still guaranteeing one fresh
 * snapshot per work session.
 */
export async function runChromeTreeBackupAtBoot(
  minIntervalMs: number = 60 * 60 * 1000,
  now: number = Date.now(),
): Promise<ChromeTreeBackupResult | null> {
  if (typeof chrome === "undefined" || !chrome.bookmarks || !chrome.downloads) {
    return null;
  }

  let firstBootDone = false;
  try {
    const stored = await chrome.storage?.local.get(FIRST_BOOT_FLAG);
    firstBootDone = Boolean(stored?.[FIRST_BOOT_FLAG]);
  } catch {
    // chrome.storage may be unavailable in odd contexts; treat as first boot.
  }

  if (firstBootDone) {
    const api = downloadsApi();
    try {
      const items = await api.search({ filenameRegex: CHROME_TREE_BACKUP_REGEX });
      const newest = items.reduce<number>((max, it) => {
        const t = Date.parse(it.startTime ?? "") || 0;
        return t > max ? t : max;
      }, 0);
      if (newest > 0 && now - newest < minIntervalMs) {
        return null;
      }
    } catch (err) {
      console.warn("chrome-tree-backup: boot search failed, proceeding", err);
    }
  }

  const result = await runChromeTreeBackupOnce(now);
  try {
    await chrome.storage?.local.set({ [FIRST_BOOT_FLAG]: true });
  } catch {
    // best-effort
  }
  return result;
}
