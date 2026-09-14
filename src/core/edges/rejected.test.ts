import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDB, resetDBForTests } from "../storage/db";
import {
  isEdgePairRejected,
  listRejectedEdgePairs,
  loadRejectedPairSet,
  pairKeyFor,
  rejectEdgePair,
  unrejectEdgePair,
} from "./rejected";

beforeEach(async () => {
  await getDB().rejectedEdgePairs.clear();
});

afterEach(() => {
  resetDBForTests();
});

describe("pairKeyFor", () => {
  it("sorts ids so order doesn't matter", () => {
    expect(pairKeyFor("a", "b")).toBe("a|b");
    expect(pairKeyFor("b", "a")).toBe("a|b");
  });
});

describe("rejectEdgePair", () => {
  it("stores a rejection row keyed by the sorted pair", async () => {
    const row = await rejectEdgePair("b", "a");
    expect(row.pair).toBe("a|b");
    expect(row.createdAt).toBeGreaterThan(0);
  });

  it("is idempotent: rejecting the same pair twice keeps the original createdAt", async () => {
    const first = await rejectEdgePair("a", "b");
    await new Promise((r) => setTimeout(r, 2));
    const second = await rejectEdgePair("b", "a");
    expect(second.createdAt).toBe(first.createdAt);
    expect(await listRejectedEdgePairs()).toHaveLength(1);
  });

  it("rejects a self-pair", async () => {
    await expect(rejectEdgePair("x", "x")).rejects.toThrow();
  });
});

describe("isEdgePairRejected", () => {
  it("returns true in either order for a rejected pair", async () => {
    await rejectEdgePair("a", "b");
    expect(await isEdgePairRejected("a", "b")).toBe(true);
    expect(await isEdgePairRejected("b", "a")).toBe(true);
  });

  it("returns false for an un-rejected pair", async () => {
    expect(await isEdgePairRejected("a", "b")).toBe(false);
  });

  it("returns false for a self-pair", async () => {
    expect(await isEdgePairRejected("x", "x")).toBe(false);
  });
});

describe("unrejectEdgePair", () => {
  it("removes the rejection so it no longer filters", async () => {
    await rejectEdgePair("a", "b");
    await unrejectEdgePair("b", "a");
    expect(await isEdgePairRejected("a", "b")).toBe(false);
    expect(await listRejectedEdgePairs()).toHaveLength(0);
  });

  it("is a no-op for an unknown pair", async () => {
    await unrejectEdgePair("a", "b");
    expect(await listRejectedEdgePairs()).toHaveLength(0);
  });
});

describe("loadRejectedPairSet", () => {
  it("returns every rejection as a set keyed by the sorted pair", async () => {
    await rejectEdgePair("a", "b");
    await rejectEdgePair("c", "a");
    const set = await loadRejectedPairSet();
    expect(set.has("a|b")).toBe(true);
    expect(set.has("a|c")).toBe(true);
    expect(set.size).toBe(2);
  });
});
