import {
  BACKUP_ALARM_NAME,
  installBackupAlarm,
  runBackupOnce,
  runChromeTreeBackupOnce,
} from "@/core/backup";
import { wireUnreadBadge } from "@/core/badge";
import { installContextMenu } from "@/core/contextMenu";
import {
  ENRICHMENT_ALARM_NAME,
  installEnrichmentAlarm,
  runEnrichmentSweepIfEnabled,
} from "@/core/enrichment";
import { DEAD_LINK_ALARM_NAME, installDeadLinkAlarm, runDeadLinkSweep } from "@/core/maintenance";
import { migrateLegacyStore } from "@/core/migration/legacyToV1";
import { installOmnibox } from "@/core/omnibox";
import {
  ensureInvertedIndexInitialized,
  ensureSearchIndexInitialized,
  wireInvertedIndexer,
  wireSearchIndexer,
} from "@/core/search";
import { ensureOffscreen } from "@/core/semantic";
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

const OVERVIEW_PATH = "overview.html";

async function setIconToCorrectVersion(tabId: number) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url) return;
    const existing = await getBookmarkByRawUrl(tab.url);
    chrome.action.setIcon({ path: existing ? ADDED_ICON : NOT_ADDED_ICON });
  } catch (err) {
    // Tab closed between the event firing and chrome.tabs.get resolving.
    // Common during rapid tab churn; nothing to do.
    const msg = err instanceof Error ? err.message : String(err);
    if (/No tab with id/i.test(msg)) return;
    console.error("setIconToCorrectVersion failed", err);
  }
}

async function openOrFocusOverview(): Promise<void> {
  const overviewUrl = chrome.runtime.getURL(OVERVIEW_PATH);
  try {
    // Match overview.html with any trailing hash/search so we still focus a
    // tab the user navigated within (e.g. #edit=<id> from a context-menu).
    const existing = await chrome.tabs.query({ url: `${overviewUrl}*` });
    const tab = existing[0];
    if (tab?.id !== undefined) {
      if (typeof tab.windowId === "number") {
        await chrome.windows.update(tab.windowId, { focused: true });
      }
      await chrome.tabs.update(tab.id, { active: true });
      return;
    }
    await chrome.tabs.create({ url: overviewUrl });
  } catch (err) {
    console.error("openOrFocusOverview failed", err);
  }
}

export default defineBackground(() => {
  chrome.tabs.onActivated.addListener((activeInfo) => {
    setIconToCorrectVersion(activeInfo.tabId);
  });

  chrome.tabs.onUpdated.addListener((tabId) => {
    setIconToCorrectVersion(tabId);
  });

  // Toolbar icon click (and the _execute_action keyboard shortcut) opens the
  // bookmarks overview tab. Focuses an existing overview tab if one exists.
  chrome.action.onClicked.addListener(() => {
    void openOrFocusOverview();
  });

  // The popup entry point used to trigger legacy-store migration on first
  // open. With the popup gone, run it once at SW startup. Idempotent.
  migrateLegacyStore().catch((err) => console.error("legacy migration failed", err));

  // Boot sync: register Chrome bookmarks listeners + run initial import +
  // reconcile drift. Idempotent.
  startSync().catch((err) => console.error("startSync failed", err));

  // Boot search index: subscribe to live bookmark changes + backfill if empty.
  wireSearchIndexer();
  ensureSearchIndexInitialized().catch((err) =>
    console.error("ensureSearchIndexInitialized failed", err),
  );

  // Boot inverted-index (per-field termFreq store): debounced live sync +
  // full reindex on startup when the store looks thin vs the corpus.
  wireInvertedIndexer();
  ensureInvertedIndexInitialized().catch((err) =>
    console.error("ensureInvertedIndexInitialized failed", err),
  );

  // Boot the semantic-embed offscreen document. Idempotent: ensureOffscreen()
  // calls chrome.offscreen.hasDocument() before creating. The doc lazy-warms
  // the transformers.js pipeline on first message.
  ensureOffscreen().catch((err) => console.error("ensureOffscreen failed", err));

  // Periodic alarms: auto-backup, dead-link sweep, enrichment sweep. install()
  // calls register/refresh each alarm based on current settings.
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === BACKUP_ALARM_NAME) {
      runBackupOnce().catch((err) => console.error("auto-backup failed", err));
      runChromeTreeBackupOnce().catch((err) => console.error("chrome-tree-backup failed", err));
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

  // Side panel: keep the action click bound to our overview tab opener (the
  // default side-panel-on-action-click behaviour would steal the click).
  // Users open the side panel via the keyboard command or the context menu.
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
