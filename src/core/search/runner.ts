/**
 * Query runner — executes a parsed Query against the postings index and
 * the bookmark store, returning a ranked list of bookmarks.
 *
 * Ranking formula (per matched bookmark):
 *   score = sum(weight of each matched bare term)
 *         * log(1 + (rating ?? 0) / 2)
 *         * 1 / (1 + days_since_updated / 30)
 *
 * - log(1 + r/2): smooth, finite at r=0, monotonically increasing in r.
 *   rating=10 contributes ln(6) ≈ 1.79; null rating contributes ln(1)=0,
 *   so we floor at a tiny epsilon to keep unrated matches sortable.
 * - 1 / (1 + days/30): half-life-ish recency decay; ~30 days halves
 *   the recency factor.
 */

import type { Bookmark } from "../../shared/types";
import { getBookmarkById } from "../storage/bookmarks";
import { getDB, type Posting } from "../storage/db";
import { getPostingsForTerm } from "./indexer";
import { type Query, ratingMatches } from "./query";

export type SearchOptions = {
  limit?: number;
  now?: number;
};

const DEFAULT_LIMIT = 100;
const DAYS_MS = 24 * 60 * 60 * 1000;

function recencyDecay(now: number, updatedAt: number): number {
  const days = Math.max(0, (now - updatedAt) / DAYS_MS);
  return 1 / (1 + days / 30);
}

function ratingBoost(rating: number | null): number {
  const r = rating ?? 0;
  // Floor at a tiny constant so unrated bookmarks still rank, just lower.
  return Math.max(Math.log(1 + r / 2), 0.01);
}

/**
 * Execute a Query AST. Returns ranked bookmarks, top N first.
 */
export async function runQuery(q: Query, opts: SearchOptions = {}): Promise<Bookmark[]> {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const now = opts.now ?? Date.now();

  // Score accumulator: bookmarkId -> sum of weights for matched terms.
  // null means "no filtering by term" (no bare terms in query).
  const termScores: Map<string, number> | null = q.bare.length > 0 ? new Map() : null;

  if (termScores) {
    // Fetch postings for each bare term in parallel.
    const allPostings: Posting[][] = await Promise.all(
      q.bare.map((term) => getPostingsForTerm(term)),
    );

    // Per-term: collect (bookmarkId -> best weight for this term).
    const perTermBest: Array<Map<string, number>> = allPostings.map((postings) => {
      const best = new Map<string, number>();
      for (const p of postings) {
        const cur = best.get(p.bookmarkId);
        if (cur === undefined || p.weight > cur) best.set(p.bookmarkId, p.weight);
      }
      return best;
    });

    if (perTermBest.length === 0 || perTermBest.some((m) => m.size === 0)) {
      return [];
    }

    // Intersect: bookmark must appear in every term's posting list.
    // Start with the smallest set.
    perTermBest.sort((a, b) => a.size - b.size);
    const [seed, ...rest] = perTermBest;
    for (const [bookmarkId, weight] of seed) {
      let total = weight;
      let inAll = true;
      for (const other of rest) {
        const w = other.get(bookmarkId);
        if (w === undefined) {
          inAll = false;
          break;
        }
        total += w;
      }
      if (inAll) termScores.set(bookmarkId, total);
    }

    if (termScores.size === 0) return [];
  }

  // Candidate bookmark ids: either the term-intersection result, or "all".
  const db = getDB();
  let candidates: Bookmark[];
  if (termScores) {
    const ids = Array.from(termScores.keys());
    candidates = (await Promise.all(ids.map((id) => getBookmarkById(id)))).filter(
      (b): b is Bookmark => b !== undefined,
    );
  } else {
    candidates = await db.bookmarks.toArray();
  }

  // Apply filters.
  const tagSet = new Set(q.tags);
  const excludeTagSet = new Set(q.excludeTags);
  const domainSet = new Set(q.domains);
  const statusSet = new Set(q.statuses);
  const filtered = candidates.filter((b) => {
    if (q.untagged && b.tags.length > 0) return false;
    if (tagSet.size > 0) {
      const haveAll = Array.from(tagSet).every((t) => b.tags.some((bt) => bt.toLowerCase() === t));
      if (!haveAll) return false;
    }
    if (excludeTagSet.size > 0) {
      const hit = b.tags.some((bt) => excludeTagSet.has(bt.toLowerCase()));
      if (hit) return false;
    }
    if (domainSet.size > 0 && !domainSet.has(b.domain.toLowerCase())) return false;
    if (statusSet.size > 0 && !statusSet.has(b.status)) return false;
    if (!ratingMatches(b.rating, q.rating)) return false;
    return true;
  });

  // Rank.
  const scored = filtered.map((b) => {
    const baseWeight = termScores?.get(b.id) ?? 1;
    const score = baseWeight * ratingBoost(b.rating) * recencyDecay(now, b.updatedAt);
    return { bookmark: b, score };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // tiebreak by updatedAt desc
    return b.bookmark.updatedAt - a.bookmark.updatedAt;
  });

  return scored.slice(0, limit).map((s) => s.bookmark);
}

/**
 * High-level convenience: parse + run + return top N. The empty query
 * returns the most recently updated bookmarks (limit applied).
 */
export async function search(queryString: string, opts: SearchOptions = {}): Promise<Bookmark[]> {
  // Lazy import keeps the cycle with query.ts trivial.
  const { parseQuery } = await import("./query");
  const q = parseQuery(queryString);
  if (
    q.bare.length === 0 &&
    q.tags.length === 0 &&
    q.excludeTags.length === 0 &&
    q.domains.length === 0 &&
    q.statuses.length === 0 &&
    q.rating === null &&
    !q.untagged
  ) {
    const limit = opts.limit ?? DEFAULT_LIMIT;
    const db = (await import("../storage/db")).getDB();
    const all = await db.bookmarks.orderBy("updatedAt").reverse().limit(limit).toArray();
    return all;
  }
  return runQuery(q, opts);
}
