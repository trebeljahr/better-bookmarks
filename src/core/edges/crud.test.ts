import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDB, resetDBForTests } from "../storage/db";
import { createEdge, deleteEdge, findManualEdgeBetween, listAllEdges, listEdgesFor } from "./crud";

beforeEach(async () => {
  const db = getDB();
  await db.edges.clear();
  await db.bookmarks.clear();
});

afterEach(() => {
  resetDBForTests();
});

describe("createEdge", () => {
  it("creates a new edge with defaults (manual, undirected, empty note)", async () => {
    const edge = await createEdge({ fromId: "a", toId: "b", type: "related" });
    expect(edge.fromId).toBe("a");
    expect(edge.toId).toBe("b");
    expect(edge.type).toBe("related");
    expect(edge.source).toBe("manual");
    expect(edge.directed).toBe(false);
    expect(edge.note).toBe("");
    expect(edge.id).toBeTruthy();
    expect(edge.createdAt).toBeGreaterThan(0);
  });

  it("dedups: same (fromId, toId, type) returns the original edge", async () => {
    const first = await createEdge({ fromId: "a", toId: "b", type: "related", note: "first" });
    const second = await createEdge({ fromId: "a", toId: "b", type: "related", note: "second" });
    expect(second.id).toBe(first.id);
    expect(second.note).toBe("first");
    expect(await listAllEdges()).toHaveLength(1);
  });

  it("treats different types between the same pair as distinct edges", async () => {
    const r = await createEdge({ fromId: "a", toId: "b", type: "related" });
    const s = await createEdge({ fromId: "a", toId: "b", type: "source" });
    expect(r.id).not.toBe(s.id);
    expect(await listAllEdges()).toHaveLength(2);
  });

  it("treats reverse direction as a distinct row by design", async () => {
    await createEdge({ fromId: "a", toId: "b", type: "related" });
    await createEdge({ fromId: "b", toId: "a", type: "related" });
    expect(await listAllEdges()).toHaveLength(2);
  });

  it("rejects self-edges", async () => {
    await expect(createEdge({ fromId: "x", toId: "x", type: "related" })).rejects.toThrow();
  });

  it("respects explicit directed=true and a custom source", async () => {
    const edge = await createEdge({
      fromId: "a",
      toId: "b",
      type: "source",
      directed: true,
      source: "auto-tag",
      note: "auto",
    });
    expect(edge.directed).toBe(true);
    expect(edge.source).toBe("auto-tag");
    expect(edge.note).toBe("auto");
  });
});

describe("listEdgesFor", () => {
  it("returns edges where the bookmark is fromId or toId", async () => {
    const e1 = await createEdge({ fromId: "a", toId: "b", type: "related" });
    const e2 = await createEdge({ fromId: "c", toId: "a", type: "source" });
    const e3 = await createEdge({ fromId: "b", toId: "c", type: "related" });

    const aEdges = await listEdgesFor("a");
    const ids = aEdges.map((e) => e.id).sort();
    expect(ids).toEqual([e1.id, e2.id].sort());
    expect(aEdges.find((e) => e.id === e3.id)).toBeUndefined();
  });

  it("returns no edges for a bookmark with no connections", async () => {
    await createEdge({ fromId: "a", toId: "b", type: "related" });
    expect(await listEdgesFor("z")).toEqual([]);
  });

  it("excludes non-manual edges by default", async () => {
    await createEdge({ fromId: "a", toId: "b", type: "related", source: "manual" });
    await createEdge({ fromId: "a", toId: "c", type: "related", source: "auto-tag" });
    await createEdge({ fromId: "a", toId: "d", type: "related", source: "auto-domain" });
    const visible = await listEdgesFor("a");
    expect(visible.map((e) => e.toId).sort()).toEqual(["b"]);
  });

  it("includes auto-* edges when includeSuggested is true", async () => {
    await createEdge({ fromId: "a", toId: "b", type: "related", source: "manual" });
    await createEdge({ fromId: "a", toId: "c", type: "related", source: "auto-tag" });
    const all = await listEdgesFor("a", { includeSuggested: true });
    expect(all.map((e) => e.toId).sort()).toEqual(["b", "c"]);
  });

  it("dedupes when a bookmark appears on both ends of the same edge row", async () => {
    // Defensive: shouldn't actually happen (createEdge forbids it), but the
    // listEdgesFor merging logic should still produce a unique result if
    // someone manages to plant such a row.
    await getDB().edges.put({
      id: "edge-1",
      fromId: "a",
      toId: "a",
      type: "related",
      note: "",
      directed: false,
      createdAt: 1,
      source: "manual",
    });
    const list = await listEdgesFor("a");
    expect(list).toHaveLength(1);
  });
});

describe("deleteEdge", () => {
  it("removes an edge by id", async () => {
    const edge = await createEdge({ fromId: "a", toId: "b", type: "related" });
    await deleteEdge(edge.id);
    expect(await listAllEdges()).toHaveLength(0);
  });

  it("is a no-op for an unknown id", async () => {
    await createEdge({ fromId: "a", toId: "b", type: "related" });
    await deleteEdge("nonexistent");
    expect(await listAllEdges()).toHaveLength(1);
  });
});

describe("findManualEdgeBetween", () => {
  it("finds a manual edge in either direction", async () => {
    await createEdge({ fromId: "a", toId: "b", type: "related" });
    expect((await findManualEdgeBetween("a", "b"))?.fromId).toBe("a");
    expect((await findManualEdgeBetween("b", "a"))?.fromId).toBe("a");
  });

  it("ignores auto-* edges", async () => {
    await createEdge({ fromId: "a", toId: "b", type: "related", source: "auto-tag" });
    expect(await findManualEdgeBetween("a", "b")).toBeUndefined();
  });

  it("filters by edge type when provided", async () => {
    await createEdge({ fromId: "a", toId: "b", type: "related" });
    expect(await findManualEdgeBetween("a", "b", "source")).toBeUndefined();
    expect((await findManualEdgeBetween("a", "b", "related"))?.toId).toBe("b");
  });
});
