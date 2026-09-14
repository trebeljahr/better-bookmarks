/**
 * CRUD helpers for the `pageSnapshots` Dexie table (see DECISIONS D15).
 * One row per bookmark, keyed on `bookmarkId`. A fresh capture replaces
 * the previous row — `put` on the same key semantics.
 *
 * Callers that need the extraction + capping pipeline should reach for
 * `capturePageSnapshot` in `core/enrichment/pageSnapshot.ts`; this module
 * only stores what it is given.
 */

import type { PageSnapshot } from "../../shared/types";
import { getDB } from "./db";

export async function putPageSnapshot(snapshot: PageSnapshot): Promise<void> {
  await getDB().pageSnapshots.put(snapshot);
}

export async function getPageSnapshot(bookmarkId: string): Promise<PageSnapshot | undefined> {
  return getDB().pageSnapshots.get(bookmarkId);
}

export async function deletePageSnapshot(bookmarkId: string): Promise<void> {
  await getDB().pageSnapshots.delete(bookmarkId);
}

export async function countPageSnapshots(): Promise<number> {
  return getDB().pageSnapshots.count();
}
