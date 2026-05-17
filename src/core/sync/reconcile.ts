import { getDB } from "../storage/db";
import { handleChanged, handleCreated, handleMoved, handleRemoved } from "./handlers";
import { importChromeTree } from "./initialImport";
import { listAllMappings } from "./mapping";

/**
 * Walk Chrome's bookmark tree, compare against our mapping table,
 * and synthesise the appropriate handler call for anything that
 * drifted. Runs on cold start and on overview-open, debounced.
 */

let lastRunAt = 0;
const MIN_GAP_MS = 60_000;

export async function reconcile(opts: { force?: boolean } = {}): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.bookmarks) return;
  const now = Date.now();
  if (!opts.force && now - lastRunAt < MIN_GAP_MS) return;
  lastRunAt = now;

  const tree = await chrome.bookmarks.getTree();
  const liveNodes = new Map<string, chrome.bookmarks.BookmarkTreeNode>();
  function visit(node: chrome.bookmarks.BookmarkTreeNode) {
    liveNodes.set(node.id, node);
    node.children?.forEach(visit);
  }
  for (const root of tree) visit(root);

  const knownMappings = await listAllMappings();
  const knownIds = new Set(knownMappings.map((m) => m.chromeId));
  const mappingsById = new Map(knownMappings.map((m) => [m.chromeId, m] as const));

  for (const [id, node] of liveNodes) {
    if (!knownIds.has(id)) {
      await handleCreated(
        { id, url: node.url, title: node.title ?? "", parentId: node.parentId },
        now,
      );
      continue;
    }
    const mapping = mappingsById.get(id);
    if (!mapping) continue;
    if (
      (node.title ?? "") !== mapping.lastKnownTitle ||
      (node.url ?? "") !== mapping.lastKnownUrl
    ) {
      await handleChanged({ id, title: node.title, url: node.url }, now);
    }
    if ((node.parentId ?? null) !== mapping.lastKnownParentId) {
      await handleMoved(
        {
          id,
          parentId: node.parentId ?? "",
          oldParentId: mapping.lastKnownParentId ?? "",
        },
        now,
      );
    }
  }

  for (const mapping of knownMappings) {
    if (!liveNodes.has(mapping.chromeId)) {
      await handleRemoved(mapping.chromeId, now);
    }
  }
}

export async function rebuildMappingsFromScratch(): Promise<void> {
  const db = getDB();
  await db.chromeMappings.clear();
  if (typeof chrome === "undefined" || !chrome.bookmarks) return;
  const tree = await chrome.bookmarks.getTree();
  await importChromeTree(tree);
}

export function resetReconcileGuardForTests(): void {
  lastRunAt = 0;
}
