/**
 * Graph subset selection.
 *
 * The overview graph view is scoped to the currently-visible query
 * result — the same array the list view already renders. On a large
 * result set we cap the drawn subgraph at `GRAPH_NODE_CAP` nodes so
 * the O(N^2) force simulation stays cheap and the SVG stays legible.
 *
 * These helpers are intentionally pure: no DOM, no Dexie, no hooks.
 * They take plain data and return plain data so they can be exercised
 * from unit tests without a test renderer.
 */

import type { Bookmark, Edge } from "../../shared/types";

export const GRAPH_NODE_CAP = 200;

export type GraphNode = {
  id: string;
  /** Original bookmark title, or canonicalUrl if the title is empty. */
  label: string;
  /** First tag on the bookmark (case preserved). `null` when untagged. */
  primaryTag: string | null;
  /** Number of visible edges incident to this node (both directions). */
  degree: number;
};

export type GraphEdge = {
  id: string;
  fromId: string;
  toId: string;
  /**
   * Rendering width scalar. For auto edges we use `edge.strength ?? 1`;
   * manual edges default to 1 unless they carry a strength.
   */
  strength: number;
};

export type GraphSubset = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Bookmarks that were visible but dropped because we hit the cap. */
  droppedNodeCount: number;
  /** Edges dropped because at least one endpoint fell to the cap. */
  droppedEdgeCount: number;
};

export type SelectSubsetOptions = {
  /** Node cap; defaults to `GRAPH_NODE_CAP`. */
  cap?: number;
};

/**
 * Build the drawable subgraph from a currently-visible bookmark array
 * and the full edge table.
 *
 * Ordering: `visible` is the array the list view is already displaying
 * (already sorted by relevance / date / whatever the user picked), so
 * we keep the first `cap` entries verbatim. That gives a stable rule
 * ("the top of the list is drawn") — no cherry-picking by degree, no
 * hidden re-ranking.
 *
 * Edges: only edges whose *both* endpoints survived the cap are kept.
 * The degree count on each node reflects those kept edges, so a node
 * whose only neighbours were dropped will report `degree === 0` and
 * float on its own — that's the honest signal.
 */
export function selectGraphSubset(
  visible: readonly Bookmark[],
  allEdges: readonly Edge[],
  opts: SelectSubsetOptions = {},
): GraphSubset {
  const cap = Math.max(0, opts.cap ?? GRAPH_NODE_CAP);
  const capped = visible.slice(0, cap);
  const droppedNodeCount = Math.max(0, visible.length - capped.length);

  const kept = new Map<string, GraphNode>();
  for (const b of capped) {
    kept.set(b.id, {
      id: b.id,
      label: b.title.trim().length > 0 ? b.title : b.canonicalUrl,
      primaryTag: b.tags.length > 0 ? b.tags[0] : null,
      degree: 0,
    });
  }

  const edges: GraphEdge[] = [];
  let droppedEdgeCount = 0;
  for (const e of allEdges) {
    const from = kept.get(e.fromId);
    const to = kept.get(e.toId);
    if (!from || !to) {
      // Only count edges that touch a currently-visible bookmark;
      // otherwise every edge in the store would show up as "dropped"
      // when the user filters down to a handful of results.
      if (kept.has(e.fromId) || kept.has(e.toId)) droppedEdgeCount++;
      continue;
    }
    if (from === to) continue; // guard against self-edges from bad data
    const strength = typeof e.strength === "number" && Number.isFinite(e.strength) ? e.strength : 1;
    edges.push({ id: e.id, fromId: e.fromId, toId: e.toId, strength });
    from.degree++;
    to.degree++;
  }

  return {
    nodes: Array.from(kept.values()),
    edges,
    droppedNodeCount,
    droppedEdgeCount,
  };
}
