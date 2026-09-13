/**
 * Search indexer.
 *
 * Maintains the `postings` object store in IndexedDB. Each posting is the
 * tuple (term, bookmarkId, field, weight) and represents "this bookmark
 * has this term in this field with this weight". The same (term,
 * bookmarkId) pair only appears once even if the term appears multiple
 * times in different fields — we keep the highest-weighted field.
 */

import type { Bookmark } from "../../shared/types";
import { listBookmarks } from "../storage/bookmarks";
import { getDB, type Posting, type SearchIndexRow } from "../storage/db";
import { tokenize, tokenizeDomain, tokenizeInverted } from "./tokenize";

export type Field = Posting["field"];

export const FIELD_WEIGHTS: Record<Field, number> = {
  title: 3,
  description: 2,
  note: 2,
  tag: 4,
  domain: 1,
};

type Accum = Map<string, { field: Field; weight: number }>;

function recordTerm(acc: Accum, term: string, field: Field): void {
  const weight = FIELD_WEIGHTS[field];
  const existing = acc.get(term);
  if (!existing || weight > existing.weight) {
    acc.set(term, { field, weight });
  }
}

function postingsForBookmark(bookmark: Bookmark): Posting[] {
  const acc: Accum = new Map();

  for (const t of tokenize(bookmark.title)) {
    recordTerm(acc, t, "title");
  }
  for (const t of tokenize(bookmark.description)) {
    recordTerm(acc, t, "description");
  }
  for (const t of tokenize(bookmark.note)) {
    recordTerm(acc, t, "note");
  }
  for (const tag of bookmark.tags) {
    // For tags we use the lowercased name as a single canonical token plus
    // any internal sub-tokens (so `tag:AI-Tools` matches a search for "ai").
    const lower = tag.toLowerCase().trim();
    if (lower) recordTerm(acc, lower, "tag");
    for (const sub of tokenize(tag)) {
      recordTerm(acc, sub, "tag");
    }
  }
  for (const t of tokenizeDomain(bookmark.domain)) {
    recordTerm(acc, t, "domain");
  }

  const out: Posting[] = [];
  for (const [term, { field, weight }] of acc) {
    out.push({ term, bookmarkId: bookmark.id, field, weight });
  }
  return out;
}

/**
 * Index a single bookmark. Idempotent — calling twice replaces previous
 * postings for that bookmark.
 */
export async function indexBookmark(bookmark: Bookmark): Promise<void> {
  const db = getDB();
  await db.transaction("rw", db.postings, async () => {
    await db.postings.where("bookmarkId").equals(bookmark.id).delete();
    const postings = postingsForBookmark(bookmark);
    if (postings.length > 0) {
      await db.postings.bulkPut(postings);
    }
  });
}

/**
 * Remove all postings for a bookmark. Safe to call on a non-indexed id.
 */
export async function removeBookmark(bookmarkId: string): Promise<void> {
  const db = getDB();
  await db.postings.where("bookmarkId").equals(bookmarkId).delete();
}

/**
 * Clear the index and rebuild it from `listBookmarks()`. Used on first
 * boot of the search subsystem and when the schema changes meaningfully.
 *
 * Returns a small status object so the caller can surface progress.
 */
export async function reindexAll(): Promise<{ indexed: number }> {
  const db = getDB();
  const bookmarks = await listBookmarks();
  await db.postings.clear();
  if (bookmarks.length === 0) return { indexed: 0 };
  const all: Posting[] = [];
  for (const b of bookmarks) {
    for (const p of postingsForBookmark(b)) all.push(p);
  }
  if (all.length > 0) {
    await db.postings.bulkPut(all);
  }
  return { indexed: bookmarks.length };
}

/**
 * Internal helper for the query runner. Returns the postings for a single
 * lowercased term.
 */
export async function getPostingsForTerm(term: string): Promise<Posting[]> {
  if (!term) return [];
  return getDB().postings.where("term").equals(term).toArray();
}

// ---------------------------------------------------------------------------
// Inverted-index (`searchIndex`) — per-field term-frequency store.
//
// Coexists with the `postings` store above during the transition to
// frequency-based ranking. `buildInvertedIndex` is pure (returns rows,
// does not persist); `removeFromIndex` and `fullReindex` mutate the
// `searchIndex` table.
// ---------------------------------------------------------------------------

export type SearchIndexField = SearchIndexRow["field"];

const INVERTED_REINDEX_CHUNK = 500;

function bumpTermFreq(counts: Map<string, number>, term: string, field: SearchIndexField): void {
  const key = `${term}\x00${field}`;
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function domainLabels(domain: string | null | undefined): string[] {
  if (!domain) return [];
  const host = domain.toLowerCase().trim();
  if (!host) return [];
  const out: string[] = [];
  if (host.length >= 2) out.push(host);
  for (const label of host.split(".")) {
    if (label.length >= 2) out.push(label);
  }
  return out;
}

function urlTokens(url: string | null | undefined): string[] {
  if (!url) return [];
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return [];
  }
  const out: string[] = [];
  const host = parsed.hostname.toLowerCase();
  if (host.length >= 2) out.push(host);
  for (const label of host.split(".")) {
    if (label.length >= 2) out.push(label);
  }
  for (const segment of parsed.pathname.split("/").filter(Boolean)) {
    for (const t of tokenizeInverted(decodeURIComponent(segment))) {
      out.push(t);
    }
  }
  return out;
}

/**
 * Build the set of inverted-index rows for a single bookmark. Pure — the
 * caller decides whether to `bulkPut` them.
 *
 * One row per (term, field) pair the bookmark contains, with `termFreq`
 * counting how many times the term appears in that field. Tags contribute
 * one occurrence each of their lowercased canonical name; the tag's
 * sub-tokens are NOT emitted (a tag `ai-tools` does not index `ai`).
 * Domain and URL contributions are label-split so that a search for
 * `github` finds a bookmark hosted at `github.com/foo/bar`.
 */
export function buildInvertedIndex(bookmark: Bookmark): SearchIndexRow[] {
  const counts = new Map<string, number>();

  for (const t of tokenizeInverted(bookmark.title)) bumpTermFreq(counts, t, "title");
  for (const t of tokenizeInverted(bookmark.note)) bumpTermFreq(counts, t, "note");

  for (const tag of bookmark.tags) {
    const lower = tag.toLowerCase().trim();
    if (lower.length >= 2) bumpTermFreq(counts, lower, "tag");
  }

  for (const t of domainLabels(bookmark.domain)) bumpTermFreq(counts, t, "domain");

  const url = bookmark.originalUrl || bookmark.canonicalUrl;
  for (const t of urlTokens(url)) bumpTermFreq(counts, t, "url");

  const rows: SearchIndexRow[] = [];
  for (const [key, termFreq] of counts) {
    const sep = key.indexOf("\x00");
    const term = key.slice(0, sep);
    const field = key.slice(sep + 1) as SearchIndexField;
    rows.push({ term, bookmarkId: bookmark.id, field, termFreq });
  }
  return rows;
}

/**
 * Delete every `searchIndex` row that references `bookmarkId`. Idempotent
 * — safe to call for a bookmark that was never indexed.
 */
export async function removeFromIndex(bookmarkId: string): Promise<void> {
  if (!bookmarkId) return;
  const db = getDB();
  await db.searchIndex.where("bookmarkId").equals(bookmarkId).delete();
}

/**
 * Clear the `searchIndex` store and rebuild it from every persisted
 * bookmark, walking the collection in 500-row chunks so a large corpus
 * doesn't spike memory.
 *
 * `progressCb` fires after each chunk with (done, total). It's also
 * invoked once with (0, 0) on an empty corpus so callers can drive a
 * determinate progress bar.
 */
export async function fullReindex(
  progressCb?: (done: number, total: number) => void,
): Promise<{ indexed: number }> {
  const db = getDB();
  await db.searchIndex.clear();

  const bookmarks = await listBookmarks();
  const total = bookmarks.length;
  if (total === 0) {
    progressCb?.(0, 0);
    return { indexed: 0 };
  }

  let done = 0;
  for (let offset = 0; offset < total; offset += INVERTED_REINDEX_CHUNK) {
    const chunk = bookmarks.slice(offset, offset + INVERTED_REINDEX_CHUNK);
    const rows: SearchIndexRow[] = [];
    for (const b of chunk) {
      for (const row of buildInvertedIndex(b)) rows.push(row);
    }
    if (rows.length > 0) {
      await db.searchIndex.bulkPut(rows);
    }
    done += chunk.length;
    progressCb?.(done, total);
  }
  return { indexed: total };
}
