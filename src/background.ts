import { BACKUP_ALARM_NAME, installBackupAlarm, runBackupOnce } from "./core/backup";
import { installOmnibox } from "./core/omnibox";
import { ensureSearchIndexInitialized, wireSearchIndexer } from "./core/search";
import { getBookmarkByRawUrl } from "./core/storage/bookmarks";
import { startSync } from "./core/sync";

const NOT_ADDED_ICON = {
  "16": "/empty16.png",
  "32": "/empty32.png",
  "48": "/empty48.png",
  "128": "/empty128.png",
};

const ADDED_ICON = {
  "16": "/full16.png",
  "32": "/full32.png",
  "48": "/full48.png",
  "128": "/full128.png",
};

async function setIconToCorrectVersion(tabId: number) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url) return;
    const existing = await getBookmarkByRawUrl(tab.url);
    chrome.action.setIcon({ path: existing ? ADDED_ICON : NOT_ADDED_ICON });
  } catch (err) {
    console.error("setIconToCorrectVersion failed", err);
  }
}

chrome.tabs.onActivated.addListener((activeInfo) => {
  setIconToCorrectVersion(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener((tabId) => {
  setIconToCorrectVersion(tabId);
});

// Boot sync: register Chrome bookmarks listeners + run initial import +
// reconcile drift. Idempotent.
startSync().catch((err) => console.error("startSync failed", err));

// Boot search index: subscribe to live bookmark changes + backfill if empty.
wireSearchIndexer();
ensureSearchIndexInitialized().catch((err) =>
  console.error("ensureSearchIndexInitialized failed", err),
);

// Auto-backup alarm. The listener runs on the periodic alarm; install()
// registers/refreshes the alarm based on current settings.
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === BACKUP_ALARM_NAME) {
    runBackupOnce().catch((err) => console.error("auto-backup failed", err));
  }
});
installBackupAlarm().catch((err) => console.error("installBackupAlarm failed", err));

// Omnibox: register `bb` keyword listeners.
installOmnibox();
