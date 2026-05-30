/**
 * Wires the search indexer to live Dexie events.
 *
 * Dexie hooks are per-instance, so each JS execution context that does
 * writes (service worker, popup, overview) needs to call wireSearchIndexer()
 * once on boot. The function is idempotent — repeated calls within the
 * same context are no-ops.
 *
 * The wiring also kicks off a background reindexAll on first boot if the
 * postings store is empty, so users who land in P3 with an existing
 * bookmark corpus get search support without a manual rebuild.
 */

import type { Bookmark } from "../../shared/types";
import { getDB } from "../storage/db";
import { indexBookmark, reindexAll, removeBookmark } from "./indexer";

let wired = false;
let suppressed = 0;

/**
 * Suppress per-bookmark hook-triggered indexing while a bulk-write code path
 * runs. Callers MUST follow with a matching release via `setSearchIndexerSuppressed(false)`
 * and a single `reindexAll()` to repopulate the postings store.
 *
 * Implemented as a counter so nested suppressors compose. Negative counts
 * clamp to zero defensively.
 */
export function setSearchIndexerSuppressed(value: boolean): void {
  suppressed = Math.max(0, suppressed + (value ? 1 : -1));
}

export function isSearchIndexerSuppressed(): boolean {
  return suppressed > 0;
}

export function wireSearchIndexer(): void {
  if (wired) return;
  wired = true;

  const db = getDB();

  db.bookmarks.hook("creating", function (this, _primKey, obj, _trans) {
    if (suppressed > 0) return;
    queueMicrotask(() => {
      indexBookmark(obj as Bookmark).catch((err) => {
        console.error("search indexBookmark (creating) failed", err);
      });
    });
  });

  db.bookmarks.hook("updating", function (this, mods, _primKey, obj, _trans) {
    if (suppressed > 0) return;
    // Merge the diff onto the existing record so we don't need to re-read
    // through Dexie (re-reads from inside a hook race the transaction
    // commit under fake-indexeddb and produce flaky tests).
    const next = { ...(obj as Bookmark), ...(mods as Partial<Bookmark>) };
    queueMicrotask(() => {
      indexBookmark(next).catch((err) => {
        console.error("search indexBookmark (updating) failed", err);
      });
    });
  });

  db.bookmarks.hook("deleting", function (this, primKey, _obj, _trans) {
    if (suppressed > 0) return;
    queueMicrotask(() => {
      removeBookmark(primKey as string).catch((err) => {
        console.error("search removeBookmark (deleting) failed", err);
      });
    });
  });
}

let initialReindexPromise: Promise<void> | null = null;

/**
 * Ensures the postings store has been populated at least once. Idempotent
 * and concurrent-safe across callers (returns the same promise).
 */
export function ensureSearchIndexInitialized(): Promise<void> {
  if (initialReindexPromise) return initialReindexPromise;
  const db = getDB();
  initialReindexPromise = (async () => {
    try {
      const count = await db.postings.count();
      if (count > 0) return;
      const bookmarkCount = await db.bookmarks.count();
      if (bookmarkCount === 0) return;
      await reindexAll();
    } catch (err) {
      console.error("initial search reindex failed", err);
      // Reset so a later caller can retry.
      initialReindexPromise = null;
    }
  })();
  return initialReindexPromise;
}

export function resetSearchWiringForTests(): void {
  wired = false;
  initialReindexPromise = null;
  suppressed = 0;
}
