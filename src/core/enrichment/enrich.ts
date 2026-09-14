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
import { detectContentType } from "./contentType";
import { type FetchAndParseOpts, fetchAndParseMeta, type MetaResult } from "./fetcher";
import { type CapturePageSnapshotResult, maybeCaptureSnapshotFromSettings } from "./pageSnapshot";

export type EnrichResult = {
  updated: boolean;
  reason?: string;
  snapshot?: CapturePageSnapshotResult | null;
};

export type SnapshotCapturer = (opts: {
  bookmarkId: string;
  html: string;
  now: number;
}) => Promise<CapturePageSnapshotResult | null>;

export type EnrichOptions = {
  force?: boolean;
  fetcher?: (url: string, opts?: FetchAndParseOpts) => Promise<MetaResult>;
  now?: number;
  /**
   * Optional override for the page-snapshot capture step (D15). Default
   * checks `settings.networkEnrichmentEnabled` + `pageSnapshotEnabled`
   * and writes to the `pageSnapshots` Dexie table. Tests inject a spy
   * (or a no-op) to keep the enrich unit tests hermetic.
   */
  snapshotCapturer?: SnapshotCapturer;
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
  const snapshotCapturer = opts.snapshotCapturer ?? defaultSnapshotCapturer;
  // Ask for html only when a snapshot capturer is wired. The default
  // capturer respects settings itself, but even the request for html
  // is a >0 alloc — we hand the flag through so a test that injects
  // `snapshotCapturer: null` keeps the meta-only fetch shape.
  const meta = await fetcher(bookmark.originalUrl, { includeHtml: true });
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

  // og:type wins over the URL-pattern first pass but never over a user
  // choice. A stored value is treated as auto-derived when it matches what
  // `detectContentType` would produce for this canonical URL (or is still
  // the "unknown" default); anything else is assumed user-set and left
  // alone.
  const urlGuess = detectContentType(bookmark.canonicalUrl);
  const currentIsAutoGuess =
    bookmark.contentType === "unknown" || bookmark.contentType === urlGuess;
  if (currentIsAutoGuess) {
    const mapped = mapOgTypeToContentType(meta.ogType);
    if (mapped && mapped !== bookmark.contentType) patch.contentType = mapped;
  }

  patch.enrichedAt = now;

  await updateBookmark(bookmark.id, patch);

  // Snapshot the page after the meta patch. Order matters only for the
  // "did we touch this bookmark" trail: enrichedAt is bumped first so a
  // snapshot failure never leaves us re-enriching the same page on
  // every sweep. The capturer is expected to swallow its own errors
  // rather than throw; guard here anyway so a snapshot bug can't take
  // enrichment down with it.
  let snapshot: CapturePageSnapshotResult | null = null;
  if (meta.html) {
    try {
      snapshot = await snapshotCapturer({
        bookmarkId: bookmark.id,
        html: meta.html,
        now,
      });
    } catch (err) {
      console.warn("enrichBookmark: snapshot capture failed", bookmark.id, err);
    }
  }

  const changedFieldCount = Object.keys(patch).length - 1; // exclude enrichedAt
  return { updated: changedFieldCount > 0, snapshot };
}

async function defaultSnapshotCapturer(opts: {
  bookmarkId: string;
  html: string;
  now: number;
}): Promise<CapturePageSnapshotResult | null> {
  return maybeCaptureSnapshotFromSettings(opts);
}
