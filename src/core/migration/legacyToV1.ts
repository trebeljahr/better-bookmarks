import { ulid } from "@/core/util/ulid";
import type { Bookmark } from "../../shared/types";
import { canonicalize } from "../canonicalizer";
import { dedupTags } from "../storage/bookmarks";
import { getDB } from "../storage/db";

const MIGRATION_FLAG = "__bb_legacy_migration__";
const SETTINGS_KEY = "__bb_settings__";

type LegacyBookmark = {
  url: string;
  description?: string;
  rating?: number;
  necessaryTime?: number;
  timestamp?: number;
  tags?: string[];
};

export type MigrationReport = {
  alreadyRan: boolean;
  legacyCount: number;
  imported: number;
  merged: number;
  rejected: number;
};

export async function migrateLegacyStore(opts: { force?: boolean } = {}): Promise<MigrationReport> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    return { alreadyRan: false, legacyCount: 0, imported: 0, merged: 0, rejected: 0 };
  }

  const flagResult = await chrome.storage.local.get(MIGRATION_FLAG);
  if (flagResult[MIGRATION_FLAG] && !opts.force) {
    return { alreadyRan: true, legacyCount: 0, imported: 0, merged: 0, rejected: 0 };
  }

  const all = await chrome.storage.local.get(null);
  const entries = Object.entries(all).filter(([key, value]) => {
    if (key.startsWith("__bb_")) return false;
    if (key === SETTINGS_KEY) return false;
    if (!value || typeof value !== "object") return false;
    const v = value as Partial<LegacyBookmark>;
    return typeof v.url === "string";
  }) as [string, LegacyBookmark][];

  let imported = 0;
  let merged = 0;
  let rejected = 0;
  const db = getDB();

  await db.transaction("rw", db.bookmarks, async () => {
    for (const [, legacy] of entries) {
      const c = canonicalize(legacy.url);
      if (!c.ok) {
        rejected += 1;
        continue;
      }
      const existing = await db.bookmarks.where("canonicalUrl").equals(c.canonical).first();
      const now = legacy.timestamp ?? Date.now();
      if (existing) {
        const mergedRecord: Bookmark = {
          ...existing,
          title: existing.title || legacy.description || "",
          description: existing.description || legacy.description || "",
          tags: dedupTags([...existing.tags, ...(legacy.tags ?? [])]),
          rating:
            legacy.rating !== undefined &&
            (existing.rating === null || legacy.rating > existing.rating)
              ? legacy.rating
              : existing.rating,
          necessaryTime:
            legacy.necessaryTime !== undefined && existing.necessaryTime === null
              ? legacy.necessaryTime
              : existing.necessaryTime,
          createdAt: Math.min(existing.createdAt, now),
          updatedAt: Date.now(),
        };
        await db.bookmarks.put(mergedRecord);
        merged += 1;
      } else {
        const fresh: Bookmark = {
          id: ulid(now),
          canonicalUrl: c.canonical,
          originalUrl: legacy.url,
          domain: c.domain,
          title: legacy.description ?? "",
          description: legacy.description ?? "",
          note: "",
          tags: dedupTags(legacy.tags ?? []),
          rating: legacy.rating ?? null,
          necessaryTime: legacy.necessaryTime ?? null,
          contentType: "unknown",
          language: null,
          status: "unread",
          readAt: null,
          createdAt: now,
          updatedAt: now,
          capturedFrom: "chrome-import",
        };
        await db.bookmarks.put(fresh);
        imported += 1;
      }
    }
  });

  await chrome.storage.local.set({ [MIGRATION_FLAG]: { ranAt: Date.now() } });

  return { alreadyRan: false, legacyCount: entries.length, imported, merged, rejected };
}
