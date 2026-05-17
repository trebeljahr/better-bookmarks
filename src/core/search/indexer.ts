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
import { getDB, type Posting } from "../storage/db";
import { tokenize, tokenizeDomain } from "./tokenize";

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
