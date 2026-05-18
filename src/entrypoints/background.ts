import { wireUnreadBadge } from "@/core/badge";
import { BACKUP_ALARM_NAME, installBackupAlarm, runBackupOnce } from "@/core/backup";
import { installContextMenu } from "@/core/contextMenu";
import {
  ENRICHMENT_ALARM_NAME,
  installEnrichmentAlarm,
  runEnrichmentSweepIfEnabled,
} from "@/core/enrichment";
import { DEAD_LINK_ALARM_NAME, installDeadLinkAlarm, runDeadLinkSweep } from "@/core/maintenance";
import { installOmnibox } from "@/core/omnibox";
import { ensureSearchIndexInitialized, wireSearchIndexer } from "@/core/search";
import { getBookmarkByRawUrl } from "@/core/storage/bookmarks";
import { startSync } from "@/core/sync";

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

export default defineBackground(() => {
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

  // Periodic alarms: auto-backup, dead-link sweep, enrichment sweep. install()
  // calls register/refresh each alarm based on current settings.
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === BACKUP_ALARM_NAME) {
      runBackupOnce().catch((err) => console.error("auto-backup failed", err));
    } else if (alarm.name === DEAD_LINK_ALARM_NAME) {
      runDeadLinkSweep().catch((err) => console.error("dead-link sweep failed", err));
    } else if (alarm.name === ENRICHMENT_ALARM_NAME) {
      runEnrichmentSweepIfEnabled().catch((err) => console.error("enrichment sweep failed", err));
    }
  });
  installBackupAlarm().catch((err) => console.error("installBackupAlarm failed", err));
  installDeadLinkAlarm().catch((err) => console.error("installDeadLinkAlarm failed", err));
  installEnrichmentAlarm().catch((err) => console.error("installEnrichmentAlarm failed", err));

  // Omnibox: register `bb` keyword listeners.
  installOmnibox();

  // Side panel: keep the action click bound to the popup (default behavior
  // would steal the click and open the side panel instead). Users open the
  // side panel via the keyboard command or the context menu.
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: false })
      .catch((err) => console.error("setPanelBehavior failed", err));
  }

  chrome.commands.onCommand.addListener(async (name) => {
    if (name !== "open_sidepanel") return;
    try {
      const win = await chrome.windows.getCurrent();
      if (typeof win.id === "number") {
        await chrome.sidePanel.open({ windowId: win.id });
      }
    } catch (err) {
      console.error("open_sidepanel failed", err);
    }
  });

  // Context menus: "Add", "Add (with note)", "Tag…" submenu of top tags.
  installContextMenu();

  // Action badge: unread count, refreshed on bookmark mutations.
  wireUnreadBadge();
});
