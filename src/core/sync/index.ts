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
import { runChromeTreeBackupAtBoot } from "../backup/chromeTreeBackup";
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

export async function startSync(): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.bookmarks) return;
  if (registered.value) return;
  registered.value = true;

  // Safety snapshot: dump the raw chrome.bookmarks tree to ~/Downloads
  // BEFORE any initial-import / reconcile work, so a fresh on-disk backup
  // always exists if a sync bug corrupts the Chrome side during dev.
  try {
    const result = await runChromeTreeBackupAtBoot();
    if (result) {
      console.info(
        "chrome tree backup:",
        result.fileName,
        `(${result.nodeCount} nodes, ${result.byteSize} bytes)`,
      );
    }
  } catch (err) {
    console.error("chrome tree backup at boot failed", err);
  }

  chrome.bookmarks.onCreated.addListener((id, node) => {
    handleCreated({
      id,
      url: node.url,
      title: node.title ?? "",
      parentId: node.parentId,
    }).catch((err) => console.error("handleCreated failed", err));
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
