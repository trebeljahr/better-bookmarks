import { ulid } from "ulid";
import type { Bookmark, Edge, EdgeSource } from "../../shared/types";
import { getBookmarkById, listBookmarks } from "../storage/bookmarks";
import { listAllEdges } from "./crud";

/**
 * An edge that has not been written to the store. Returned from the
 * suggester so the UI can render candidates; calling `materializeSuggestion`
 * writes it.
 */
export type SuggestedEdge = Edge & {
  strength: number;
  reason: string;
};

export type SuggestEdgesOptions = {
  limit?: number;
};

const DEFAULT_LIMIT = 10;

/**
 * D13: surface a candidate edge if
 *   (shared tag count >= 1 AND same domain)  OR  (shared tag count >= 2)
 *
 * strength = sharedTagCount * 2 + (sameDomain ? 1 : 0)
 *
 * Sorted strength desc, then bookmark.updatedAt desc. Excludes the bookmark
 * itself and any pair that already has a manual edge between them.
 *
 * Suggestions are computed read-side. We do NOT write them to the store
 * here — the user "accepts" via `materializeSuggestion`.
 */
export async function suggestEdgesFor(
  bookmarkId: string,
  opts: SuggestEdgesOptions = {},
): Promise<SuggestedEdge[]> {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const subject = await getBookmarkById(bookmarkId);
  if (!subject) return [];

  const [all, edges] = await Promise.all([listBookmarks(), listAllEdges()]);
  const manualPairs = collectManualPairs(edges);

  const subjectTags = lowercaseTagSet(subject.tags);

  type Candidate = {
    bookmark: Bookmark;
    sharedTags: string[];
    sameDomain: boolean;
    strength: number;
  };
  const candidates: Candidate[] = [];

  for (const other of all) {
    if (other.id === bookmarkId) continue;
    if (hasManualEdge(manualPairs, bookmarkId, other.id)) continue;

    const sharedTags = intersectTags(other.tags, subjectTags);
    const sameDomain = subject.domain === other.domain && subject.domain !== "";

    const passes = (sharedTags.length >= 1 && sameDomain) || sharedTags.length >= 2;
    if (!passes) continue;

    candidates.push({
      bookmark: other,
      sharedTags,
      sameDomain,
      strength: sharedTags.length * 2 + (sameDomain ? 1 : 0),
    });
  }

  candidates.sort((a, b) => {
    if (b.strength !== a.strength) return b.strength - a.strength;
    return b.bookmark.updatedAt - a.bookmark.updatedAt;
  });

  return candidates.slice(0, limit).map((c) => {
    const source: EdgeSource =
      c.sameDomain && c.sharedTags.length === 0 ? "auto-domain" : "auto-tag";
    return {
      id: ulid(),
      fromId: bookmarkId,
      toId: c.bookmark.id,
      type: "related",
      note: "",
      directed: false,
      createdAt: 0,
      source,
      strength: c.strength,
      reason: buildReason(c.sharedTags, c.sameDomain),
    };
  });
}

/**
 * Promote a suggestion into a stored manual edge so the user can later see
 * and unlink it like any other connection.
 *
 * Implemented inline rather than via `createEdge` to keep the call sites
 * decoupled — the suggester output is the source of truth for the edge
 * fields, and we just stamp it as manual and assign a fresh id/timestamp.
 */
export async function materializeSuggestion(suggestion: SuggestedEdge): Promise<Edge> {
  const { createEdge } = await import("./crud");
  return createEdge({
    fromId: suggestion.fromId,
    toId: suggestion.toId,
    type: suggestion.type,
    note: suggestion.note,
    directed: suggestion.directed,
    source: "manual",
  });
}

function lowercaseTagSet(tags: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const t of tags) {
    const k = t.trim().toLowerCase();
    if (k) out.add(k);
  }
  return out;
}

function intersectTags(rawB: readonly string[], lowerA: Set<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of rawB) {
    const key = t.trim().toLowerCase();
    if (!key) continue;
    if (!lowerA.has(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    // Prefer the display case from B since it's the one the candidate
    // bookmark carries. (Tags are case-insensitive by D18; display-case
    // doesn't drive correctness, only the human reason string.)
    out.push(t.trim());
  }
  // Sort for deterministic reason strings.
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

function collectManualPairs(edges: readonly Edge[]): Set<string> {
  const out = new Set<string>();
  for (const e of edges) {
    if (e.source !== "manual") continue;
    out.add(pairKey(e.fromId, e.toId));
  }
  return out;
}

function hasManualEdge(pairs: Set<string>, a: string, b: string): boolean {
  return pairs.has(pairKey(a, b)) || pairs.has(pairKey(b, a));
}

function pairKey(a: string, b: string): string {
  return `${a}\x1f${b}`;
}

function buildReason(sharedTags: readonly string[], sameDomain: boolean): string {
  if (sharedTags.length === 0) return "same domain";
  const label = sharedTags.length === 1 ? "shared tag" : "shared tags";
  const tags = sharedTags.join(", ");
  if (sameDomain) return `same domain + ${label}: ${tags}`;
  return `${label}: ${tags}`;
}
