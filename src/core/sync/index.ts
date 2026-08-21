export {
  chromeChangeWins,
  resolveTitleUrl,
} from "./conflictResolver";
export {
  ancestorFolderNames,
  findTagsMirroringFolder,
  listMirroredTags,
  SYNTHETIC_ROOT_TITLES,
  setTagMirror,
} from "./folderMirror";
export {
  handleChanged,
  handleCreated,
  handleMoved,
  handleRemoved,
  inFlightCreateKey,
} from "./handlers";
export { createInFlightTracker, inFlight } from "./inFlight";
export {
  importChromeTree,
  runInitialImportIfNeeded,
} from "./initialImport";
export {
  deleteMapping,
  getMappingByChromeId,
  getMappingsByBookmarkId,
  listAllMappings,
  touchEventAt,
  upsertMapping,
} from "./mapping";
export {
  findOrCreateBookmarkInChrome,
  pushBookmarkDeleteToChrome,
  pushBookmarkUpdateToChrome,
  pushNewBookmarkToChrome,
} from "./outbound";
export { rebuildMappingsFromScratch, reconcile, resetReconcileGuardForTests } from "./reconcile";

import type { Bookmark } from "../../shared/types";
import { getBookmarkByRawUrl } from "../storage/bookmarks";
import { getDB } from "../storage/db";
import { getSettings } from "../storage/settings";
import { handleChanged, handleCreated, handleMoved, handleRemoved } from "./handlers";
import { runInitialImportIfNeeded } from "./initialImport";
import {
  pushBookmarkDeleteToChrome,
  pushBookmarkUpdateToChrome,
  pushNewBookmarkToChrome,
} from "./outbound";
import { reconcile } from "./reconcile";

/**
 * Wire up listeners on the chrome.bookmarks API. Idempotent — calling
 * twice is safe because we keep handlers in a module-scope set.
 */
const registered = { value: false };

// Set true once the initial Chrome→store import has run. Before that, every
// onCreated event we see is a synthetic import event we never want to react
// to interactively (otherwise the overview would pop on each imported row).
let initialImportDone = false;

export async function startSync(): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.bookmarks) return;
  if (registered.value) return;
  registered.value = true;

  chrome.bookmarks.onCreated.addListener((id, node) => {
    handleCreated({
      id,
      url: node.url,
      title: node.title ?? "",
      parentId: node.parentId,
    }).catch((err) => console.error("handleCreated failed", err));
    if (initialImportDone && node.url) {
      void maybeOpenOverviewForNativeCreate(node.url);
    }
  });

  chrome.bookmarks.onChanged.addListener((id, change) => {
    handleChanged({ id, title: change.title, url: change.url }).catch((err) =>
      console.error("handleChanged failed", err),
    );
  });

  chrome.bookmarks.onRemoved.addListener((id) => {
    handleRemoved(id).catch((err) => console.error("handleRemoved failed", err));
  });

  chrome.bookmarks.onMoved.addListener((id, info) => {
    handleMoved({
      id,
      parentId: info.parentId,
      oldParentId: info.oldParentId,
    }).catch((err) => console.error("handleMoved failed", err));
  });

  try {
    const report = await runInitialImportIfNeeded();
    if ("bookmarksSeen" in report) {
      console.info("initial import:", report);
    }
  } catch (err) {
    console.error("initial import failed", err);
  }
  initialImportDone = true;

  wireOutboundHooks();

  try {
    await reconcile({ force: true });
  } catch (err) {
    console.error("startup reconcile failed", err);
  }
}

let outboundWired = false;

function wireOutboundHooks(): void {
  if (outboundWired) return;
  outboundWired = true;

  const db = getDB();

  db.bookmarks.hook("creating", function (this, _primKey, obj, _trans) {
    queueMicrotask(async () => {
      try {
        const settings = await getSettings();
        if (!settings.syncEnabled) return;
        if (obj.capturedFrom === "chrome-import" || obj.capturedFrom === "chrome-sync") return;
        await pushNewBookmarkToChrome(obj as Bookmark);
      } catch (err) {
        console.error("outbound create failed", err);
      }
    });
  });

  db.bookmarks.hook("updating", function (this, _mods, _primKey, obj, _trans) {
    queueMicrotask(async () => {
      try {
        const settings = await getSettings();
        if (!settings.syncEnabled) return;
        const latest = await db.bookmarks.get((obj as Bookmark).id);
        if (!latest) return;
        await pushBookmarkUpdateToChrome(latest);
      } catch (err) {
        console.error("outbound update failed", err);
      }
    });
  });

  db.bookmarks.hook("deleting", function (this, primKey, _obj, _trans) {
    queueMicrotask(async () => {
      try {
        const settings = await getSettings();
        if (!settings.syncEnabled) return;
        await pushBookmarkDeleteToChrome(primKey as string);
      } catch (err) {
        console.error("outbound delete failed", err);
      }
    });
  });
}

export function resetOutboundWiringForTests(): void {
  outboundWired = false;
}

export function resetInitialImportFlagForTests(): void {
  initialImportDone = false;
}

/**
 * When the user creates a bookmark via Chrome's native flow (Cmd+D, star
 * icon, Bookmarks menu), surface the Better Bookmarks editor by opening or
 * focusing the overview tab with `#edit=<id>`. Best-effort and gated on:
 *  - the openOverviewOnNativeBookmark setting being on,
 *  - the new bookmark matching the active tab's URL (so we don't react to
 *    bookmarks dropped on other tabs by extensions),
 *  - the create not being the echo of our own outbound write.
 */
async function maybeOpenOverviewForNativeCreate(rawUrl: string): Promise<void> {
  try {
    const settings = await getSettings();
    if (!settings.openOverviewOnNativeBookmark) return;
    if (!chrome.tabs?.query) return;
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!activeTab?.url || activeTab.url !== rawUrl) return;
    const stored = await getBookmarkByRawUrl(rawUrl);
    if (!stored) return;
    await openOverviewForEdit(stored.id);
  } catch (err) {
    console.warn("maybeOpenOverviewForNativeCreate failed", err);
  }
}

async function openOverviewForEdit(bookmarkId: string): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.runtime?.getURL || !chrome.tabs) return;
  const overviewUrl = chrome.runtime.getURL("overview.html");
  const targetUrl = `${overviewUrl}#edit=${bookmarkId}`;
  try {
    const existing = await chrome.tabs.query({ url: `${overviewUrl}*` });
    const tab = existing[0];
    if (tab?.id !== undefined) {
      if (typeof tab.windowId === "number" && chrome.windows?.update) {
        await chrome.windows.update(tab.windowId, { focused: true });
      }
      await chrome.tabs.update(tab.id, { active: true, url: targetUrl });
      return;
    }
    await chrome.tabs.create({ url: targetUrl });
  } catch (err) {
    console.warn("openOverviewForEdit failed", err);
  }
}
