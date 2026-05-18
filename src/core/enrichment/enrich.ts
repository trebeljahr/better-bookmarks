/**
 * Single-bookmark enrichment: fetch the original URL, parse meta, patch
 * only the fields that are currently empty/missing.
 *
 * Conservative on purpose — we never overwrite user-supplied data. The
 * `force` option only bypasses the freshness check, not the field-by-field
 * gates.
 */

import type { Bookmark, ContentType } from "../../shared/types";
import { updateBookmark } from "../storage/bookmarks";
import { fetchAndParseMeta, type MetaResult } from "./fetcher";

export type EnrichResult = {
  updated: boolean;
  reason?: string;
};

export type EnrichOptions = {
  force?: boolean;
  fetcher?: (url: string) => Promise<MetaResult>;
  now?: number;
};

const OG_TYPE_TO_CONTENT_TYPE: Record<string, ContentType> = {
  article: "article",
  "blog.post": "article",
  blogpost: "article",
  news_article: "article",
  "news.article": "article",
  "article.news": "article",
  book: "book",
  "books.book": "book",
  "books.author": "book",
  video: "video",
  "video.movie": "video",
  "video.episode": "video",
  "video.tv_show": "video",
  "video.other": "video",
  movie: "video",
  music: "podcast",
  "music.song": "podcast",
  "music.album": "podcast",
  "music.playlist": "podcast",
  "music.radio_station": "podcast",
  podcast: "podcast",
  "music.podcast": "podcast",
  "podcast.episode": "podcast",
};

export function mapOgTypeToContentType(ogType: string | undefined): ContentType | null {
  if (!ogType) return null;
  const key = ogType.trim().toLowerCase();
  return OG_TYPE_TO_CONTENT_TYPE[key] ?? null;
}

function titleIsBareUrl(title: string, originalUrl: string, canonicalUrl: string): boolean {
  const t = title.trim();
  if (!t) return true;
  return t === originalUrl || t === canonicalUrl;
}

export async function enrichBookmark(
  bookmark: Bookmark,
  opts: EnrichOptions = {},
): Promise<EnrichResult> {
  const fetcher = opts.fetcher ?? fetchAndParseMeta;
  const meta = await fetcher(bookmark.originalUrl);
  const now = opts.now ?? Date.now();

  if (!meta.ok) {
    await updateBookmark(bookmark.id, { enrichedAt: now });
    return { updated: false, reason: meta.reason };
  }

  const patch: Partial<Bookmark> = {};

  if (meta.title && titleIsBareUrl(bookmark.title, bookmark.originalUrl, bookmark.canonicalUrl)) {
    patch.title = meta.title;
  }

  if (meta.description && bookmark.description.trim() === "") {
    patch.description = meta.description;
  }

  if (meta.lang && bookmark.language === null) {
    patch.language = meta.lang;
  }

  if (typeof meta.readingTimeMin === "number" && bookmark.necessaryTime === null) {
    patch.necessaryTime = meta.readingTimeMin;
  }

  if (bookmark.contentType === "unknown") {
    const mapped = mapOgTypeToContentType(meta.ogType);
    if (mapped) patch.contentType = mapped;
  }

  patch.enrichedAt = now;

  await updateBookmark(bookmark.id, patch);
  const changedFieldCount = Object.keys(patch).length - 1; // exclude enrichedAt
  return { updated: changedFieldCount > 0 };
}
