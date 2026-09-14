/**
 * Read-side helpers for the "Suggested connections" UI. Return the top-K
 * auto-* edges sorted by strength descending — globally across the
 * corpus, or scoped to one bookmark.
 *
 * These are thin wrappers over `db.edges.toArray()`; the auto sweep does
 * the heavy lifting elsewhere. We keep them here (not in the sweep
 * module) so the read path never accidentally imports the alarm plumbing.
 */

import type { Edge } from "../../shared/types";
import { getDB } from "../storage/db";

export const DEFAULT_TOP_K = 10;

export type RankedSuggestionOptions = {
  limit?: number;
};

export type BookmarkScopedRankedOptions = RankedSuggestionOptions & {
  bookmarkId: string;
};

/**
 * Top-K auto edges across the whole corpus. Ties on strength break by
 * `createdAt` descending so a fresh sweep floats to the top when scores
 * tie — the older row is still the same pair, just written earlier.
 * Manual edges are filtered out; the panel is about pending suggestions.
 */
export async function listGlobalRankedAutoEdges(
  opts: RankedSuggestionOptions = {},
): Promise<Edge[]> {
  const limit = Math.max(0, opts.limit ?? DEFAULT_TOP_K);
  if (limit === 0) return [];
  const rows = await getDB().edges.toArray();
  const autoOnly = rows.filter((e) => e.source !== "manual");
  autoOnly.sort(rankCompare);
  return autoOnly.slice(0, limit);
}

/**
 * Top-K auto edges involving `bookmarkId` (on either end).
 */
export async function listRankedAutoEdgesFor(opts: BookmarkScopedRankedOptions): Promise<Edge[]> {
  const limit = Math.max(0, opts.limit ?? DEFAULT_TOP_K);
  if (limit === 0 || !opts.bookmarkId) return [];
  const db = getDB();
  const [fromSide, toSide] = await Promise.all([
    db.edges.where("fromId").equals(opts.bookmarkId).toArray(),
    db.edges.where("toId").equals(opts.bookmarkId).toArray(),
  ]);
  const merged = new Map<string, Edge>();
  for (const e of fromSide) merged.set(e.id, e);
  for (const e of toSide) merged.set(e.id, e);
  const autoOnly: Edge[] = [];
  for (const e of merged.values()) if (e.source !== "manual") autoOnly.push(e);
  autoOnly.sort(rankCompare);
  return autoOnly.slice(0, limit);
}

function rankCompare(a: Edge, b: Edge): number {
  const sa = a.strength ?? 0;
  const sb = b.strength ?? 0;
  if (sb !== sa) return sb - sa;
  return b.createdAt - a.createdAt;
}
