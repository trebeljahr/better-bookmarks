import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Edge } from "../../shared/types";
import { getDB, resetDBForTests } from "../storage/db";
import { DEFAULT_TOP_K, listGlobalRankedAutoEdges, listRankedAutoEdgesFor } from "./ranked";

async function seed(edges: Edge[]): Promise<void> {
  await getDB().edges.bulkPut(edges);
}

function autoEdge(overrides: Partial<Edge> & Pick<Edge, "id" | "fromId" | "toId">): Edge {
  return {
    type: "related",
    note: "",
    directed: false,
    createdAt: 0,
    source: "auto-tag",
    ...overrides,
  } as Edge;
}

beforeEach(async () => {
  await getDB().edges.clear();
});

afterEach(() => resetDBForTests());

describe("listGlobalRankedAutoEdges", () => {
  it("returns auto edges sorted by strength desc, capped at limit", async () => {
    await seed([
      autoEdge({ id: "e-lo", fromId: "a", toId: "b", strength: 0.2, createdAt: 1 }),
      autoEdge({ id: "e-mid", fromId: "a", toId: "c", strength: 0.5, createdAt: 2 }),
      autoEdge({ id: "e-hi", fromId: "a", toId: "d", strength: 0.9, createdAt: 3 }),
    ]);
    const rows = await listGlobalRankedAutoEdges({ limit: 2 });
    expect(rows.map((r) => r.id)).toEqual(["e-hi", "e-mid"]);
  });

  it("filters out manual edges — the panel is about pending suggestions", async () => {
    await seed([
      autoEdge({ id: "auto-1", fromId: "a", toId: "b", strength: 0.5 }),
      { ...autoEdge({ id: "manual-1", fromId: "x", toId: "y", strength: 0.99 }), source: "manual" },
    ]);
    const rows = await listGlobalRankedAutoEdges();
    expect(rows.map((r) => r.id)).toEqual(["auto-1"]);
  });

  it("breaks strength ties by createdAt desc (fresh sweep floats up)", async () => {
    await seed([
      autoEdge({ id: "old", fromId: "a", toId: "b", strength: 0.5, createdAt: 100 }),
      autoEdge({ id: "new", fromId: "a", toId: "c", strength: 0.5, createdAt: 200 }),
    ]);
    const rows = await listGlobalRankedAutoEdges();
    expect(rows.map((r) => r.id)).toEqual(["new", "old"]);
  });

  it("returns [] when limit is 0", async () => {
    await seed([autoEdge({ id: "e", fromId: "a", toId: "b", strength: 0.9 })]);
    expect(await listGlobalRankedAutoEdges({ limit: 0 })).toEqual([]);
  });

  it("defaults limit to DEFAULT_TOP_K", async () => {
    const rows: Edge[] = [];
    for (let i = 0; i < DEFAULT_TOP_K + 5; i++) {
      rows.push(
        autoEdge({
          id: `e-${i}`,
          fromId: "a",
          toId: `b-${i}`,
          strength: 1 - i / 100,
          createdAt: i,
        }),
      );
    }
    await seed(rows);
    const got = await listGlobalRankedAutoEdges();
    expect(got).toHaveLength(DEFAULT_TOP_K);
  });
});

describe("listRankedAutoEdgesFor", () => {
  it("returns edges where the bookmark is on either side, sorted by strength", async () => {
    await seed([
      autoEdge({ id: "e1", fromId: "target", toId: "b", strength: 0.5 }),
      autoEdge({ id: "e2", fromId: "c", toId: "target", strength: 0.9 }),
      autoEdge({ id: "e3", fromId: "x", toId: "y", strength: 0.99 }), // not incident
    ]);
    const rows = await listRankedAutoEdgesFor({ bookmarkId: "target" });
    expect(rows.map((r) => r.id)).toEqual(["e2", "e1"]);
  });

  it("filters out manual edges", async () => {
    await seed([
      autoEdge({ id: "auto", fromId: "target", toId: "b", strength: 0.3 }),
      {
        ...autoEdge({ id: "manual", fromId: "target", toId: "c", strength: 0.99 }),
        source: "manual",
      },
    ]);
    const rows = await listRankedAutoEdgesFor({ bookmarkId: "target" });
    expect(rows.map((r) => r.id)).toEqual(["auto"]);
  });

  it("dedupes when a bookmark shows up as both fromId and toId across the two index reads", async () => {
    // Defensively: a self-loop should still count as one row.
    await seed([
      {
        ...autoEdge({ id: "loop", fromId: "target", toId: "target", strength: 0.7 }),
      },
    ]);
    const rows = await listRankedAutoEdgesFor({ bookmarkId: "target" });
    expect(rows).toHaveLength(1);
  });

  it("returns [] for empty bookmarkId or limit 0", async () => {
    await seed([autoEdge({ id: "e", fromId: "target", toId: "b", strength: 0.9 })]);
    expect(await listRankedAutoEdgesFor({ bookmarkId: "", limit: 5 })).toEqual([]);
    expect(await listRankedAutoEdgesFor({ bookmarkId: "target", limit: 0 })).toEqual([]);
  });
});
