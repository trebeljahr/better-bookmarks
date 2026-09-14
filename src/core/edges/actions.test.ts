import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDB, resetDBForTests } from "../storage/db";
import { acceptAutoEdge, acceptAutoEdges, rejectAutoEdge } from "./actions";
import { createEdge, listAllEdges } from "./crud";
import { isEdgePairRejected, listRejectedEdgePairs } from "./rejected";

beforeEach(async () => {
  const db = getDB();
  await db.edges.clear();
  await db.rejectedEdgePairs.clear();
});

afterEach(() => {
  resetDBForTests();
});

describe("acceptAutoEdge", () => {
  it("flips source to manual and clears strength / sourceRules", async () => {
    const edge = await createEdge({
      fromId: "a",
      toId: "b",
      type: "related",
      source: "auto-tag",
    });
    // Attach strength + sourceRules the way the background sweep would.
    await getDB().edges.put({
      ...edge,
      strength: 0.72,
      sourceRules: ["sharedTag:react", "sharedDomain"],
    });

    const upgraded = await acceptAutoEdge(edge.id);
    expect(upgraded.source).toBe("manual");
    expect(upgraded.strength).toBeUndefined();
    expect(upgraded.sourceRules).toBeUndefined();
    // Endpoints + type preserved so the connections list picks it up.
    expect(upgraded.id).toBe(edge.id);
    expect(upgraded.fromId).toBe("a");
    expect(upgraded.toId).toBe("b");
    expect(upgraded.type).toBe("related");
  });

  it("is a no-op on an already-manual edge", async () => {
    const edge = await createEdge({ fromId: "a", toId: "b", type: "related" });
    const upgraded = await acceptAutoEdge(edge.id);
    expect(upgraded.source).toBe("manual");
    expect(await listAllEdges()).toHaveLength(1);
  });

  it("throws on an unknown edge id", async () => {
    await expect(acceptAutoEdge("does-not-exist")).rejects.toThrow(/not found/);
  });
});

describe("rejectAutoEdge", () => {
  it("deletes the edge and records the pair as rejected", async () => {
    const edge = await createEdge({
      fromId: "a",
      toId: "b",
      type: "related",
      source: "auto-tag",
    });
    await rejectAutoEdge(edge);
    expect(await listAllEdges()).toHaveLength(0);
    expect(await isEdgePairRejected("a", "b")).toBe(true);
    // Order-independent: rejecting (a,b) covers (b,a).
    expect(await isEdgePairRejected("b", "a")).toBe(true);
  });

  it("stores a single rejection row per pair", async () => {
    const e1 = await createEdge({
      fromId: "a",
      toId: "b",
      type: "related",
      source: "auto-tag",
    });
    await rejectAutoEdge(e1);
    // Simulate a later auto sweep re-suggesting the pair; user rejects again.
    const e2 = await createEdge({
      fromId: "b",
      toId: "a",
      type: "related",
      source: "auto-tag",
    });
    await rejectAutoEdge(e2);
    const rows = await listRejectedEdgePairs();
    expect(rows).toHaveLength(1);
  });
});

describe("acceptAutoEdges (batch)", () => {
  it("upgrades every listed auto edge and reports the count", async () => {
    const e1 = await createEdge({
      fromId: "a",
      toId: "b",
      type: "related",
      source: "auto-tag",
    });
    const e2 = await createEdge({
      fromId: "a",
      toId: "c",
      type: "related",
      source: "auto-domain",
    });
    const e3 = await createEdge({
      fromId: "d",
      toId: "e",
      type: "related",
      source: "manual",
    });

    const result = await acceptAutoEdges([e1.id, e2.id, e3.id]);
    expect(result.upgraded).toBe(2); // e3 was already manual, skipped

    const rows = await listAllEdges();
    for (const row of rows) expect(row.source).toBe("manual");
  });

  it("silently skips unknown ids so a stale UI snapshot doesn't fail the batch", async () => {
    const e1 = await createEdge({
      fromId: "a",
      toId: "b",
      type: "related",
      source: "auto-tag",
    });
    const result = await acceptAutoEdges([e1.id, "ghost-id"]);
    expect(result.upgraded).toBe(1);
  });

  it("is a no-op on an empty list", async () => {
    const result = await acceptAutoEdges([]);
    expect(result.upgraded).toBe(0);
  });
});
