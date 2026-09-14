/**
 * Frequency-based ranker over the `searchIndex` (inverted-index) store.
 *
 * Runs alongside `runner.ts` (which still reads the older `postings`
 * store) during the transition to BM25-style scoring. Callers that want
 * the new pipeline import from this module directly:
 *
 *   import { search } from "@/core/search/rank";
 *
 * The pipeline is: parse → resolve candidate ids from `searchIndex`
 * (intersect on AND-ed bare terms) → load bookmark rows → apply
 * `tag:` / `domain:` / `is:` / `rating:` / folder / untagged filters →
 * score → sort → slice to `limit`.
 *
 * Score (per bookmark):
 *   score = w_recency  * recencyDecay
 *         + w_rating   * (rating / 10)                // null → 0
 *         + w_tagMatch * (matchedTags / queryTags||0) // 0 when queryTags==0
 *         + w_termFreq * bm25Lite                     // normalised to ~[0,1]
 *
 * recencyDecay = exp(-daysSinceUpdated / 30). daysSinceUpdated is clamped
 * to be ≥ 0, so future-dated `updatedAt` values still return 1.
 *
 * bm25Lite is a per-query-term sum of `idf * tf*(k1+1)/(tf+k1)` divided
 * by `queryTerms * log(N+1)` so the factor stays in roughly [0, 1] no
 * matter how many bare terms the user typed.
 *
 * Weights come from `DEFAULT_SETTINGS` (persisted, tweakable per install)
 * or a per-call `opts.weights` override.
 */

import type { Bookmark, Settings } from "../../shared/types";
import { DEFAULT_SETTINGS } from "../../shared/types";
import { countBookmarks, getBookmarkById, listBookmarks } from "../storage/bookmarks";
import { getDB, type SearchIndexRow } from "../storage/db";
import { bookmarkIdsInFolders } from "../storage/folders";
import { getSettings } from "../storage/settings";
import { parseQuery, type Query, ratingMatches } from "./query";
import { tokenizeInverted } from "./tokenize";

export type RankFactors = {
  recency: number;
  rating: number;
  tagMatch: number;
  termFreq: number;
};

export type RankedBookmark = {
  bookmark: Bookmark;
  score: number;
  factors: RankFactors;
};

export type RankWeights = {
  recency: number;
  rating: number;
  tagMatch: number;
  termFreq: number;
};

export type RankOptions = {
  /** Max results returned. Default 100. */
  limit?: number;
  /** Injectable clock; falls back to `Date.now()`. Handy in tests. */
  now?: number;
  /** Override the stored/default weights for this one call. */
  weights?: Partial<RankWeights>;
};

const DEFAULT_LIMIT = 100;
const DAYS_MS = 24 * 60 * 60 * 1000;
const RECENCY_HALFLIFE_DAYS = 30;
const BM25_K1 = 1.2;

// Per-field multipliers applied to `termFreq` before BM25 aggregation.
// Titles and tags are the strongest signals; url/domain matches are
// weaker to avoid host-name shadowing genuine content matches.
const FIELD_MULTIPLIER: Record<SearchIndexRow["field"], number> = {
  title: 3,
  tag: 2,
  note: 1,
  domain: 0.5,
  url: 0.5,
};

function recencyDecay(now: number, updatedAt: number): number {
  const days = Math.max(0, (now - updatedAt) / DAYS_MS);
  return Math.exp(-days / RECENCY_HALFLIFE_DAYS);
}

async function rowsForTerm(term: string): Promise<SearchIndexRow[]> {
  if (!term) return [];
  return getDB().searchIndex.where("term").equals(term).toArray();
}

/**
 * Fold per-field `searchIndex` rows for one term into a single
 * (bookmarkId → weighted-tf) map.
 */
function weightRowsByBookmark(rows: SearchIndexRow[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    const mult = FIELD_MULTIPLIER[r.field] ?? 1;
    out.set(r.bookmarkId, (out.get(r.bookmarkId) ?? 0) + mult * r.termFreq);
  }
  return out;
}

function resolveWeights(settings: Settings, override?: Partial<RankWeights>): RankWeights {
  return {
    recency: override?.recency ?? settings.searchWeightRecency,
    rating: override?.rating ?? settings.searchWeightRating,
    tagMatch: override?.tagMatch ?? settings.searchWeightTagMatch,
    termFreq: override?.termFreq ?? settings.searchWeightTermFreq,
  };
}

function normaliseBareTerms(bare: string[]): string[] {
  const terms = new Set<string>();
  for (const t of bare) {
    for (const norm of tokenizeInverted(t)) terms.add(norm);
  }
  return Array.from(terms);
}

function queryIsEmpty(q: Query, normalisedBareTerms: string[]): boolean {
  return (
    normalisedBareTerms.length === 0 &&
    q.tags.length === 0 &&
    q.excludeTags.length === 0 &&
    q.domains.length === 0 &&
    q.statuses.length === 0 &&
    q.folders.length === 0 &&
    q.excludeFolders.length === 0 &&
    q.rating === null &&
    !q.untagged
  );
}

/**
 * Score a set of bookmarks against a parsed query. Public for callers
 * that already have a `Query` (e.g. saved-search UIs); most consumers
 * want the `search()` wrapper below.
 */
export async function rank(q: Query, opts: RankOptions = {}): Promise<RankedBookmark[]> {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const now = opts.now ?? Date.now();

  const bareTerms = normaliseBareTerms(q.bare);

  // Weights: settings first, per-call override on top. In tests where
  // `chrome` isn't defined, `getSettings()` returns `DEFAULT_SETTINGS`
  // untouched, so this stays pure.
  const settings = await getSettings().catch(() => DEFAULT_SETTINGS);
  const weights = resolveWeights(settings, opts.weights);

  // Resolve candidate bookmark ids by intersecting per-term posting
  // lists (AND semantics; parseQuery does not surface OR today). The
  // per-term tf and df snapshots also feed the BM25-lite factor later.
  const perTermTf: Array<Map<string, number>> = [];
  const perTermDf: number[] = [];
  let candidateIds: Set<string> | null = null;

  if (bareTerms.length > 0) {
    const perTermRows = await Promise.all(bareTerms.map(rowsForTerm));
    for (const rows of perTermRows) {
      const grouped = weightRowsByBookmark(rows);
      perTermTf.push(grouped);
      perTermDf.push(grouped.size);
      const ids = new Set(grouped.keys());
      if (candidateIds === null) {
        candidateIds = ids;
      } else {
        // AND intersect: drop anything not in every term's postings.
        for (const id of candidateIds) if (!ids.has(id)) candidateIds.delete(id);
      }
      if (candidateIds.size === 0) return [];
    }
  }

  // Load bookmark rows. Empty-query path shortcuts to a full listing so
  // the caller still gets the top-N most-recent bookmarks.
  let candidates: Bookmark[];
  if (candidateIds !== null) {
    const ids = Array.from(candidateIds);
    candidates = (await Promise.all(ids.map((id) => getBookmarkById(id)))).filter(
      (b): b is Bookmark => b !== undefined,
    );
  } else {
    candidates = await listBookmarks();
  }

  // Folder filters resolve to bookmark-id allow/deny sets (or null if
  // no folder constraint). Runs in parallel with the filter loop.
  const [includeFolderIds, excludeFolderIds] = await Promise.all([
    bookmarkIdsInFolders(q.folders),
    bookmarkIdsInFolders(q.excludeFolders),
  ]);

  const tagSet = new Set(q.tags);
  const excludeTagSet = new Set(q.excludeTags);
  const domainSet = new Set(q.domains);
  const statusSet = new Set(q.statuses);

  const filtered = candidates.filter((b) => {
    if (q.untagged && b.tags.length > 0) return false;
    if (tagSet.size > 0) {
      const lower = b.tags.map((t) => t.toLowerCase());
      for (const t of tagSet) {
        if (!lower.includes(t)) return false;
      }
    }
    if (excludeTagSet.size > 0) {
      const lower = b.tags.map((t) => t.toLowerCase());
      for (const t of lower) if (excludeTagSet.has(t)) return false;
    }
    if (domainSet.size > 0 && !domainSet.has(b.domain.toLowerCase())) return false;
    if (statusSet.size > 0 && !statusSet.has(b.status)) return false;
    if (!ratingMatches(b.rating, q.rating)) return false;
    if (includeFolderIds && !includeFolderIds.has(b.id)) return false;
    if (excludeFolderIds && excludeFolderIds.has(b.id)) return false;
    return true;
  });

  // BM25-lite scaffolding. N counts every bookmark in the store, not
  // just candidates — idf is a corpus statistic. `idfMax` bounds the
  // normalised factor to ≤ 1 in the typical case.
  const N = Math.max(1, await countBookmarks());
  const idfPerTerm = perTermDf.map((df) => Math.log((N - df + 0.5) / (df + 0.5) + 1));
  const idfMax = Math.max(1, Math.log(N + 1));

  const scored: RankedBookmark[] = filtered.map((b) => {
    const recency = recencyDecay(now, b.updatedAt);
    const rating = (b.rating ?? 0) / 10;

    let tagMatch = 0;
    if (q.tags.length > 0) {
      const lower = b.tags.map((t) => t.toLowerCase());
      let matched = 0;
      for (const qt of q.tags) if (lower.includes(qt)) matched++;
      tagMatch = matched / q.tags.length;
    }

    let termFreq = 0;
    if (bareTerms.length > 0) {
      let sum = 0;
      for (let i = 0; i < bareTerms.length; i++) {
        const tf = perTermTf[i].get(b.id) ?? 0;
        if (tf === 0) continue;
        const idf = idfPerTerm[i];
        sum += idf * ((tf * (BM25_K1 + 1)) / (tf + BM25_K1));
      }
      termFreq = sum / (bareTerms.length * idfMax);
    }

    const score =
      weights.recency * recency +
      weights.rating * rating +
      weights.tagMatch * tagMatch +
      weights.termFreq * termFreq;

    return {
      bookmark: b,
      score,
      factors: { recency, rating, tagMatch, termFreq },
    };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Deterministic tiebreak so callers see stable ordering.
    return b.bookmark.updatedAt - a.bookmark.updatedAt;
  });

  // The empty query has nothing to score against — return recent
  // bookmarks so the UI still shows something (mirrors runner.search()
  // behaviour and keeps callers interchangeable).
  if (queryIsEmpty(q, bareTerms)) {
    const db = getDB();
    const recent = await db.bookmarks.orderBy("updatedAt").reverse().limit(limit).toArray();
    return recent.map((b) => ({
      bookmark: b,
      score: weights.recency * recencyDecay(now, b.updatedAt),
      factors: {
        recency: recencyDecay(now, b.updatedAt),
        rating: (b.rating ?? 0) / 10,
        tagMatch: 0,
        termFreq: 0,
      },
    }));
  }

  return scored.slice(0, limit);
}

/**
 * Parse `query` and return the top-`limit` ranked bookmarks with their
 * score breakdown attached. Never throws — a malformed query falls
 * through to bare-word tokens inside `parseQuery`, so the caller always
 * gets *some* result set even when the syntax is off.
 */
export async function search(query: string, opts: RankOptions = {}): Promise<RankedBookmark[]> {
  return rank(parseQuery(query), opts);
}
