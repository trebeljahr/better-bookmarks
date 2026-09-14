/**
 * Unit tests for `selectGraphSubset` — the pure function that turns a
 * visible-bookmark array + full edge table into a bounded, drawable
 * subgraph. See src/core/graph/subset.ts for the contract.
 */

import { describe, expect, it } from "vitest";
import type { Bookmark, Edge } from "../../shared/types";
import { GRAPH_NODE_CAP, selectGraphSubset } from "./subset";

function mkBookmark(id: string, tags: string[] = [], title = id): Bookmark {
  return {
    id,
    canonicalUrl: `https://example.com/${id}`,
    originalUrl: `https://example.com/${id}`,
    domain: "example.com",
    title,
    description: "",
    note: "",
    tags,
    rating: null,
    necessaryTime: null,
    contentType: "unknown",
    language: null,
    status: "unread",
    readAt: null,
    createdAt: 0,
    updatedAt: 0,
    capturedFrom: "manual",
  };
}

function mkEdge(id: string, fromId: string, toId: string, strength?: number): Edge {
  return {
    id,
    fromId,
    toId,
    type: "related",
    note: "",
    directed: false,
    createdAt: 0,
    source: "manual",
    ...(strength !== undefined ? { strength } : {}),
  };
}

describe("selectGraphSubset", () => {
  it("returns empty nodes/edges for an empty visible set", () => {
    const out = selectGraphSubset([], []);
    expect(out.nodes).toEqual([]);
    expect(out.edges).toEqual([]);
    expect(out.droppedNodeCount).toBe(0);
    expect(out.droppedEdgeCount).toBe(0);
  });

  it("uses the first tag as primaryTag and title-falls-back to canonicalUrl", () => {
    const a = mkBookmark("a", ["react", "hooks"], "React basics");
    const b = mkBookmark("b", [], ""); // empty title → canonicalUrl fallback
    const out = selectGraphSubset([a, b], []);
    expect(out.nodes).toEqual([
      { id: "a", label: "React basics", primaryTag: "react", degree: 0 },
      { id: "b", label: "https://example.com/b", primaryTag: null, degree: 0 },
    ]);
  });

  it("keeps only edges whose both endpoints are visible", () => {
    const a = mkBookmark("a");
    const b = mkBookmark("b");
    // "c" is only referenced as an edge endpoint string — the bookmark
    // itself is deliberately outside the visible set so we can assert
    // the "one endpoint outside" case both in the fromId and toId
    // positions.
    const edges: Edge[] = [
      mkEdge("e1", "a", "b"),
      mkEdge("e2", "a", "c"), // crosses the boundary → dropped, counted
      mkEdge("e3", "c", "a"), // reverse direction → also dropped, counted
    ];
    const out = selectGraphSubset([a, b], edges);
    expect(out.edges.map((e) => e.id)).toEqual(["e1"]);
    expect(out.droppedEdgeCount).toBe(2);
  });

  it("does not count edges that touch zero visible endpoints as dropped", () => {
    const a = mkBookmark("a");
    // c and d are never in the visible set — the edge between them
    // touches zero visible endpoints, so it should not show up in the
    // dropped-edge tally (that tally is user-facing signal about the
    // 200-cap, not a database inspector).
    const edges: Edge[] = [mkEdge("e1", "c", "d")];
    const out = selectGraphSubset([a], edges);
    expect(out.edges).toEqual([]);
    expect(out.droppedEdgeCount).toBe(0);
  });

  it("increments degree on both endpoints of every kept edge", () => {
    const a = mkBookmark("a");
    const b = mkBookmark("b");
    const c = mkBookmark("c");
    const edges: Edge[] = [mkEdge("e1", "a", "b"), mkEdge("e2", "b", "c"), mkEdge("e3", "c", "a")];
    const out = selectGraphSubset([a, b, c], edges);
    const byId = Object.fromEntries(out.nodes.map((n) => [n.id, n]));
    expect(byId.a.degree).toBe(2);
    expect(byId.b.degree).toBe(2);
    expect(byId.c.degree).toBe(2);
  });

  it("passes through numeric strength from auto edges", () => {
    const a = mkBookmark("a");
    const b = mkBookmark("b");
    const out = selectGraphSubset([a, b], [mkEdge("e1", "a", "b", 0.42)]);
    expect(out.edges[0].strength).toBeCloseTo(0.42);
  });

  it("defaults strength to 1 when the edge lacks one", () => {
    const a = mkBookmark("a");
    const b = mkBookmark("b");
    const out = selectGraphSubset([a, b], [mkEdge("e1", "a", "b")]);
    expect(out.edges[0].strength).toBe(1);
  });

  it("caps at GRAPH_NODE_CAP by default, preserving array order", () => {
    const visible: Bookmark[] = Array.from({ length: GRAPH_NODE_CAP + 5 }, (_, i) =>
      mkBookmark(`n${i}`),
    );
    const out = selectGraphSubset(visible, []);
    expect(out.nodes).toHaveLength(GRAPH_NODE_CAP);
    expect(out.nodes[0].id).toBe("n0");
    expect(out.nodes[GRAPH_NODE_CAP - 1].id).toBe(`n${GRAPH_NODE_CAP - 1}`);
    expect(out.droppedNodeCount).toBe(5);
  });

  it("respects a custom cap and reports the drop count", () => {
    const visible: Bookmark[] = Array.from({ length: 10 }, (_, i) => mkBookmark(`n${i}`));
    const out = selectGraphSubset(visible, [], { cap: 3 });
    expect(out.nodes.map((n) => n.id)).toEqual(["n0", "n1", "n2"]);
    expect(out.droppedNodeCount).toBe(7);
  });

  it("drops edges whose partner falls outside the cap", () => {
    const visible: Bookmark[] = Array.from({ length: 5 }, (_, i) => mkBookmark(`n${i}`));
    const edges: Edge[] = [
      mkEdge("e1", "n0", "n1"), // both inside cap=3 → kept
      mkEdge("e2", "n1", "n4"), // partner outside → dropped
    ];
    const out = selectGraphSubset(visible, edges, { cap: 3 });
    expect(out.edges.map((e) => e.id)).toEqual(["e1"]);
    expect(out.droppedEdgeCount).toBe(1);
  });

  it("silently drops self-edges", () => {
    const a = mkBookmark("a");
    const out = selectGraphSubset([a], [mkEdge("e1", "a", "a")]);
    expect(out.edges).toEqual([]);
    // Self-edges are bad data, not "user hidden more than we can draw",
    // so they don't inflate the dropped-edge badge.
    expect(out.droppedEdgeCount).toBe(0);
  });
});
