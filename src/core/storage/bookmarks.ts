import { ulid } from "@/core/util/ulid";
import type { Bookmark, CaptureSource, ContentType, ReadStatus } from "../../shared/types";
import { type CanonicalizeResult, canonicalize } from "../canonicalizer";
import { detectContentType } from "../enrichment/contentType";
import { getDB } from "./db";

export type UpsertInput = {
  rawUrl: string;
  title?: string;
  description?: string;
  note?: string;
  tags?: string[];
  rating?: number | null;
  necessaryTime?: number | null;
  contentType?: ContentType;
  language?: string | null;
  status?: ReadStatus;
  capturedFrom?: CaptureSource;
};

export type UpsertResult =
  | { ok: true; bookmark: Bookmark; created: boolean }
  | { ok: false; reason: CanonicalizeResult & { ok: false } };

export async function upsertBookmark(input: UpsertInput): Promise<UpsertResult> {
  const c = canonicalize(input.rawUrl);
  if (!c.ok) return { ok: false, reason: c };

  const db = getDB();
  const now = Date.now();
  let created = false;
  const bookmark = await db.transaction("rw", db.bookmarks, async () => {
    const existing = await db.bookmarks.where("canonicalUrl").equals(c.canonical).first();
    if (existing) {
      const merged = mergeBookmarkInput(existing, input, now);
      await db.bookmarks.put(merged);
      return merged;
    }
    created = true;
    const fresh: Bookmark = {
      id: ulid(now),
      canonicalUrl: c.canonical,
      originalUrl: input.rawUrl,
      domain: c.domain,
      title: input.title ?? "",
      description: input.description ?? "",
      note: input.note ?? "",
      tags: dedupTags(input.tags ?? []),
      rating: input.rating ?? null,
      necessaryTime: input.necessaryTime ?? null,
      contentType: input.contentType ?? detectContentType(c.canonical),
      language: input.language ?? null,
      status: input.status ?? "unread",
      readAt: null,
      createdAt: now,
      updatedAt: now,
      capturedFrom: input.capturedFrom ?? "manual",
    };
    await db.bookmarks.put(fresh);
    return fresh;
  });

  return { ok: true, bookmark, created };
}

function mergeBookmarkInput(existing: Bookmark, input: UpsertInput, now: number): Bookmark {
  const tags = input.tags ? dedupTags([...existing.tags, ...input.tags]) : existing.tags;
  return {
    ...existing,
    title: input.title ?? existing.title,
    description: input.description ?? existing.description,
    note: input.note ?? existing.note,
    tags,
    rating: input.rating === undefined ? existing.rating : input.rating,
    necessaryTime: input.necessaryTime === undefined ? existing.necessaryTime : input.necessaryTime,
    contentType: input.contentType ?? existing.contentType,
    language: input.language === undefined ? existing.language : input.language,
    status: input.status ?? existing.status,
    updatedAt: now,
  };
}

export function dedupTags(tags: readonly string[]): string[] {
  const seen = new Map<string, string>();
  for (const tag of tags) {
    const trimmed = tag.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, trimmed);
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}

export async function getBookmarkById(id: string): Promise<Bookmark | undefined> {
  return getDB().bookmarks.get(id);
}

export async function getBookmarkByCanonicalUrl(
  canonicalUrl: string,
): Promise<Bookmark | undefined> {
  return getDB().bookmarks.where("canonicalUrl").equals(canonicalUrl).first();
}

export async function getBookmarkByRawUrl(rawUrl: string): Promise<Bookmark | undefined> {
  const c = canonicalize(rawUrl);
  if (!c.ok) return undefined;
  return getBookmarkByCanonicalUrl(c.canonical);
}

export async function deleteBookmark(id: string): Promise<void> {
  await getDB().bookmarks.delete(id);
}

export async function updateBookmark(
  id: string,
  patch: Partial<Omit<Bookmark, "id" | "createdAt" | "canonicalUrl" | "domain">>,
): Promise<Bookmark | undefined> {
  const db = getDB();
  const now = Date.now();
  return db.transaction("rw", db.bookmarks, async () => {
    const existing = await db.bookmarks.get(id);
    if (!existing) return undefined;
    const updated: Bookmark = {
      ...existing,
      ...patch,
      tags: patch.tags ? dedupTags(patch.tags) : existing.tags,
      updatedAt: now,
    };
    await db.bookmarks.put(updated);
    return updated;
  });
}

export async function listBookmarks(): Promise<Bookmark[]> {
  return getDB().bookmarks.toArray();
}

export async function countBookmarks(): Promise<number> {
  return getDB().bookmarks.count();
}
