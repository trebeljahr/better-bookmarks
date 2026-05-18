/**
 * Auto-backup: writes the exportJson() snapshot to ~/Downloads via
 * chrome.downloads.download. Rolling-N retention keeps only the newest N
 * matching files on disk.
 */

import { exportJson } from "../importExport/json";
import { getSettings } from "../storage/settings";

// @types/chrome 0.0.158 only types the callback signatures for these
// chrome.downloads APIs. MV3 surfaces them as Promise-returning too, so we
// re-type via a narrow local view to call them with `await`.
type DownloadsPromiseApi = {
  search(query: chrome.downloads.DownloadQuery): Promise<chrome.downloads.DownloadItem[]>;
  erase(query: chrome.downloads.DownloadQuery): Promise<number[]>;
  removeFile(id: number): Promise<void>;
  download(options: chrome.downloads.DownloadOptions): Promise<number>;
};
const downloadsApi = (): DownloadsPromiseApi => chrome.downloads as unknown as DownloadsPromiseApi;

export const BACKUP_FILENAME_PREFIX = "better-bookmarks-backup-";
export const BACKUP_FILENAME_REGEX = "better-bookmarks-backup-.*\\.json";

export type BackupResult = {
  fileName: string;
  byteSize: number;
};

export function backupFileNameFor(now: number): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `${BACKUP_FILENAME_PREFIX}${date}-${time}.json`;
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

/**
 * Run a single auto-backup. Writes to ~/Downloads via chrome.downloads.download,
 * then enforces rolling-N retention based on `settings.autoBackupKeepCount`.
 *
 * `now` defaults to `Date.now()` and is injectable for tests.
 */
export async function runBackupOnce(now: number = Date.now()): Promise<BackupResult> {
  const settings = await getSettings();
  const json = await exportJson();
  const byteSize = new TextEncoder().encode(json).byteLength;
  const fileName = backupFileNameFor(now);
  const url = `data:application/json;base64,${utf8ToBase64(json)}`;

  await downloadsApi().download({
    url,
    filename: fileName,
    saveAs: false,
    conflictAction: "uniquify",
  });

  await cleanupOldBackups(settings.autoBackupKeepCount);
  return { fileName, byteSize };
}

/**
 * Keep the newest `keep` backup files on disk; erase the rest from history
 * and remove the underlying files.
 */
export async function cleanupOldBackups(keep: number): Promise<void> {
  if (keep <= 0) return;
  const api = downloadsApi();
  const items = await api.search({ filenameRegex: BACKUP_FILENAME_REGEX });
  // Defensive: chrome may return undefined start times in edge cases.
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
      console.warn("auto-backup: removeFile failed", item.id, err);
    }
    try {
      await api.erase({ id: item.id });
    } catch (err) {
      console.warn("auto-backup: erase failed", item.id, err);
    }
  }
}
