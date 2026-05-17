import type { ChromeMapping } from "../../shared/types";
import { getDB } from "../storage/db";

export async function upsertMapping(input: {
  chromeId: string;
  bookmarkId: string | null;
  isFolder: boolean;
  parentChromeId: string | null;
  lastKnownTitle: string;
  lastKnownUrl: string;
  lastKnownParentId: string | null;
  eventAt?: number;
}): Promise<ChromeMapping> {
  const db = getDB();
  const now = Date.now();
  const mapping: ChromeMapping = {
    chromeId: input.chromeId,
    bookmarkId: input.bookmarkId,
    isFolder: input.isFolder,
    parentChromeId: input.parentChromeId,
    lastSyncedAt: now,
    lastKnownEventAt: input.eventAt ?? now,
    lastKnownTitle: input.lastKnownTitle,
    lastKnownUrl: input.lastKnownUrl,
    lastKnownParentId: input.lastKnownParentId,
  };
  await db.chromeMappings.put(mapping);
  return mapping;
}

export async function getMappingByChromeId(chromeId: string): Promise<ChromeMapping | undefined> {
  return getDB().chromeMappings.get(chromeId);
}

export async function getMappingsByBookmarkId(bookmarkId: string): Promise<ChromeMapping[]> {
  return getDB().chromeMappings.where("bookmarkId").equals(bookmarkId).toArray();
}

export async function deleteMapping(chromeId: string): Promise<void> {
  await getDB().chromeMappings.delete(chromeId);
}

export async function listAllMappings(): Promise<ChromeMapping[]> {
  return getDB().chromeMappings.toArray();
}

export async function touchEventAt(chromeId: string, eventAt: number): Promise<void> {
  const db = getDB();
  await db.transaction("rw", db.chromeMappings, async () => {
    const existing = await db.chromeMappings.get(chromeId);
    if (!existing) return;
    await db.chromeMappings.put({
      ...existing,
      lastKnownEventAt: eventAt,
      lastSyncedAt: Date.now(),
    });
  });
}
