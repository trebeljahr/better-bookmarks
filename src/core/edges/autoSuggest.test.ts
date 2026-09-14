import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Bookmark } from "../../shared/types";
import { getDB, resetDBForTests } from "../storage/db";
import {
  AUTO_EDGE_SUGGEST_CURSOR_KEY,
  evaluatePair,
  jaccard3gram,
  resetAutoEdgeSuggestCursor,
  runAutoEdgeSuggestSweep,
} from "./autoSuggest";
import { createEdge, listAllEdges } from "./crud";
import { rejectEdgePair } from "./rejected";

type StorageEntry = Record<string, unknown>;

function installFakeChrome(): { store: StorageEntry } {
  const store: StorageEntry = {};
  const chromeShim = {
    storage: {
      local: {
        get: async (keys: string | string[] | null) => {
          if (keys === null) return { ...store };
          if (typeof keys === "string") {
            return keys in store ? { [keys]: store[keys] } : {};
          }
          const out: StorageEntry = {};
          for (const k of keys) if (k in store) out[k] = store[k];
          return out;
        },
        set: async (entries: StorageEntry) => {
          Object.assign(store, entries);
        },
        remove: async (keys: string | string[]) => {
          const list = Array.isArray(keys) ? keys : [keys];
          for (const k of list) delete store[k];
        },
      },
    },
    alarms: {
      create: () => undefined,
      clear: async () => true,
    },
  };
  // biome-ignore lint/suspicious/noExplicitAny: test wiring
  (globalThis as any).chrome = chromeShim;
  return { store };
}

beforeEach(async () => {
  installFakeChrome();
  const db = getDB();
  await db.edges.clear();
  await db.bookmarks.clear();
  await db.rejectedEdgePairs.clear();
});

afterEach(() => {
  resetDBForTests();
  // biome-ignore lint/suspicious/noExplicitAny: test cleanup
  delete (globalThis as any).chrome;
});

function makeBookmark(partial: Partial<Bookmark> & { id: string }): Bookmark {
  const base = 1_700_000_000_000;
  return {
    id: partial.id,
    canonicalUrl: partial.canonicalUrl ?? `https://example.com/${partial.id}`,
    originalUrl: partial.originalUrl ?? `https://example.com/${partial.id}`,
    domain: partial.domain ?? "example.com",
    title: partial.title ?? `title-${partial.id}`,
    description: partial.description ?? "",
    note: partial.note ?? "",
    tags: partial.tags ?? [],
    rating: partial.rating ?? null,
    necessaryTime: partial.necessaryTime ?? null,
    contentType: partial.contentType ?? "unknown",
    language: partial.language ?? null,
    status: partial.status ?? "unread",
    readAt: partial.readAt ?? null,
    createdAt: partial.createdAt ?? base,
    updatedAt: partial.updatedAt ?? base,
    capturedFrom: partial.capturedFrom ?? "manual",
  };
}

async function seed(bookmarks: Bookmark[]): Promise<void> {
  await getDB().bookmarks.bulkPut(bookmarks);
}

describe("evaluatePair — threshold", () => {
  it("passes when >=1 shared tag AND same non-empty domain", () => {
    const r = evaluatePair({
      a: { domain: "arxiv.org", tags: ["ai"], title: "", note: "" },
      b: { domain: "arxiv.org", tags: ["ai"], title: "", note: "" },
    });
    expect(r.passes).toBe(true);
  });

  it("passes when >=2 shared tags across different domains", () => {
    const r = evaluatePair({
      a: { domain: "one.com", tags: ["ai", "ml"], title: "", note: "" },
      b: { domain: "two.com", tags: ["ai", "ml"], title: "", note: "" },
    });
    expect(r.passes).toBe(true);
  });

  it("does NOT pass on 1 shared tag + different domains", () => {
    const r = evaluatePair({
      a: { domain: "one.com", tags: ["ai"], title: "", note: "" },
      b: { domain: "two.com", tags: ["ai"], title: "", note: "" },
    });
    expect(r.passes).toBe(false);
  });

  it("does NOT pass on same domain with zero shared tags", () => {
    const r = evaluatePair({
      a: { domain: "shared.com", tags: [], title: "", note: "" },
      b: { domain: "shared.com", tags: [], title: "", note: "" },
    });
    expect(r.passes).toBe(false);
  });

  it("treats empty domain as no domain match", () => {
    const r = evaluatePair({
      a: { domain: "", tags: ["ai"], title: "", note: "" },
      b: { domain: "", tags: ["ai"], title: "", note: "" },
    });
    expect(r.passes).toBe(false);
  });

  it("matches tags case-insensitively", () => {
    const r = evaluatePair({
      a: { domain: "site.com", tags: ["AI", "ML"], title: "", note: "" },
      b: { domain: "site.com", tags: ["ai", "ml"], title: "", note: "" },
    });
    expect(r.passes).toBe(true);
    expect(r.sharedTags).toEqual(["ai", "ml"]);
  });
});

describe("evaluatePair — strength formula", () => {
  it("scores 1 shared tag + same domain, no text overlap", () => {
    const r = evaluatePair({
      a: { domain: "x.com", tags: ["ai"], title: "aa", note: "" },
      b: { domain: "x.com", tags: ["ai"], title: "bb", note: "" },
    });
    // 0.4 * min(1, 1/3) = 0.13333...  + 0.3 (domain)  + 0  = 0.4333
    expect(r.strength).toBeCloseTo(0.4 * (1 / 3) + 0.3, 3);
    expect(r.sourceRules).toEqual(["sharedTag:ai", "sharedDomain"]);
  });

  it("scores 3 shared tags saturates the tag term at 0.4", () => {
    const r = evaluatePair({
      a: { domain: "x.com", tags: ["ai", "ml", "papers"], title: "", note: "" },
      b: { domain: "y.com", tags: ["ai", "ml", "papers"], title: "", note: "" },
    });
    // 0.4 * min(1, 3/3) + 0 + 0 = 0.4
    expect(r.strength).toBeCloseTo(0.4, 3);
  });

  it("scores 4 shared tags stays capped at 0.4 for the tag term", () => {
    const r = evaluatePair({
      a: { domain: "x.com", tags: ["a", "b", "c", "d"], title: "", note: "" },
      b: { domain: "y.com", tags: ["a", "b", "c", "d"], title: "", note: "" },
    });
    expect(r.strength).toBeCloseTo(0.4, 3);
  });

  it("mixes tag + domain + text-similarity into the score", () => {
    const r = evaluatePair({
      a: {
        domain: "arxiv.org",
        tags: ["ai", "ml"],
        title: "transformer attention paper",
        note: "great read",
      },
      b: {
        domain: "arxiv.org",
        tags: ["ai", "ml"],
        title: "transformer attention paper",
        note: "great read",
      },
    });
    // 0.4 * min(1, 2/3) + 0.3 + 0.3 * 1 (identical text) = 0.26667 + 0.3 + 0.3
    expect(r.strength).toBeCloseTo(0.4 * (2 / 3) + 0.3 + 0.3, 3);
    expect(r.sourceRules).toContain("sharedTag:ai");
    expect(r.sourceRules).toContain("sharedTag:ml");
    expect(r.sourceRules).toContain("sharedDomain");
    expect(r.sourceRules.some((s) => s.startsWith("textSimilarity:"))).toBe(true);
  });

  it("omits textSimilarity rule when there is no character-3-gram overlap", () => {
    const r = evaluatePair({
      a: { domain: "x.com", tags: ["ai", "ml"], title: "", note: "" },
      b: { domain: "x.com", tags: ["ai", "ml"], title: "", note: "" },
    });
    expect(r.sourceRules.some((s) => s.startsWith("textSimilarity:"))).toBe(false);
  });
});

describe("jaccard3gram", () => {
  it("returns 1 for identical non-trivial strings", () => {
    expect(jaccard3gram("hello world", "hello world")).toBe(1);
  });

  it("returns 0 when either side has fewer than 3 characters", () => {
    expect(jaccard3gram("ab", "abcdef")).toBe(0);
    expect(jaccard3gram("", "abcdef")).toBe(0);
  });

  it("returns 0 for disjoint 3-gram sets", () => {
    expect(jaccard3gram("abc", "xyz")).toBe(0);
  });

  it("returns a value in (0, 1) for partial overlap", () => {
    const v = jaccard3gram("attention is all you need", "attention over long context");
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(1);
  });
});

describe("runAutoEdgeSuggestSweep — writes and dedup", () => {
  it("writes an auto-tag edge with strength + sourceRules for a passing pair", async () => {
    // Non-overlapping title + empty note isolates the strength score
    // from text similarity — we're asserting the tag+domain floor here.
    await seed([
      makeBookmark({ id: "01", domain: "x.com", tags: ["ai"], title: "alpha", note: "" }),
      makeBookmark({ id: "02", domain: "x.com", tags: ["ai"], title: "zebra", note: "" }),
    ]);
    const res = await runAutoEdgeSuggestSweep();
    expect(res.candidatesWritten).toBe(1);
    expect(res.completed).toBe(true);

    const edges = await listAllEdges();
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe("auto-tag");
    expect(edges[0].strength).toBeCloseTo(0.4 * (1 / 3) + 0.3, 3);
    expect(edges[0].sourceRules).toEqual(["sharedTag:ai", "sharedDomain"]);
    expect(edges[0].fromId).toBe("01");
    expect(edges[0].toId).toBe("02");
  });

  it("skips pairs with existing manual edges in either direction", async () => {
    await seed([
      makeBookmark({ id: "01", domain: "x.com", tags: ["ai", "ml"] }),
      makeBookmark({ id: "02", domain: "x.com", tags: ["ai", "ml"] }),
    ]);
    await createEdge({ fromId: "02", toId: "01", type: "related", source: "manual" });

    const res = await runAutoEdgeSuggestSweep();
    expect(res.candidatesWritten).toBe(0);
    const edges = await listAllEdges();
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe("manual");
  });

  it("skips user-rejected pairs regardless of direction", async () => {
    await seed([
      makeBookmark({ id: "01", domain: "x.com", tags: ["ai", "ml"] }),
      makeBookmark({ id: "02", domain: "x.com", tags: ["ai", "ml"] }),
    ]);
    await rejectEdgePair("02", "01");

    const res = await runAutoEdgeSuggestSweep();
    expect(res.candidatesWritten).toBe(0);
    expect(await listAllEdges()).toHaveLength(0);
  });

  it("does not overwrite an existing auto edge with a lower strength", async () => {
    await seed([
      makeBookmark({ id: "01", domain: "x.com", tags: ["ai", "ml"] }),
      makeBookmark({ id: "02", domain: "x.com", tags: ["ai", "ml"] }),
    ]);
    // Seed a strong auto edge from a hypothetical earlier scan.
    const seeded = await createEdge({
      fromId: "01",
      toId: "02",
      type: "related",
      source: "auto-tag",
    });
    await getDB().edges.update(seeded.id, {
      strength: 0.95,
      sourceRules: ["sharedTag:ai", "sharedTag:ml", "sharedDomain", "textSimilarity:0.90"],
    });

    const res = await runAutoEdgeSuggestSweep();
    expect(res.candidatesWritten).toBe(0);
    expect(res.candidatesUpgraded).toBe(0);
    const edges = await listAllEdges();
    expect(edges).toHaveLength(1);
    expect(edges[0].strength).toBe(0.95);
  });

  it("upgrades an existing auto edge when the new strength is higher", async () => {
    await seed([
      makeBookmark({ id: "01", domain: "x.com", tags: ["ai", "ml"] }),
      makeBookmark({ id: "02", domain: "x.com", tags: ["ai", "ml"] }),
    ]);
    const seeded = await createEdge({
      fromId: "01",
      toId: "02",
      type: "related",
      source: "auto-tag",
    });
    await getDB().edges.update(seeded.id, { strength: 0.05, sourceRules: ["stale"] });

    const res = await runAutoEdgeSuggestSweep();
    expect(res.candidatesUpgraded).toBe(1);
    expect(res.candidatesWritten).toBe(0);
    const edges = await listAllEdges();
    expect(edges).toHaveLength(1);
    expect(edges[0].id).toBe(seeded.id);
    expect((edges[0].strength ?? 0) > 0.05).toBe(true);
    expect(edges[0].sourceRules).toContain("sharedDomain");
  });

  it("no-op for a bookmark set of size 0 or 1", async () => {
    await seed([makeBookmark({ id: "01", domain: "x.com", tags: ["ai", "ml"] })]);
    const res = await runAutoEdgeSuggestSweep();
    expect(res.pairsScanned).toBe(0);
    expect(res.completed).toBe(true);
  });
});

describe("runAutoEdgeSuggestSweep — cursor", () => {
  it("saves a cursor when pairsPerTick truncates the scan", async () => {
    // 4 bookmarks -> 6 pairs. Two ticks of 3 pairs each.
    await seed([
      makeBookmark({ id: "01", domain: "x.com", tags: ["ai"] }),
      makeBookmark({ id: "02", domain: "x.com", tags: ["ai"] }),
      makeBookmark({ id: "03", domain: "x.com", tags: ["ai"] }),
      makeBookmark({ id: "04", domain: "x.com", tags: ["ai"] }),
    ]);

    const first = await runAutoEdgeSuggestSweep({ pairsPerTick: 3 });
    expect(first.pairsScanned).toBe(3);
    expect(first.completed).toBe(false);
    expect(first.cursor).not.toBeNull();

    // Cursor persisted to chrome.storage.local under the documented key.
    // biome-ignore lint/suspicious/noExplicitAny: chrome shim
    const stored = await (globalThis as any).chrome.storage.local.get(AUTO_EDGE_SUGGEST_CURSOR_KEY);
    expect(stored[AUTO_EDGE_SUGGEST_CURSOR_KEY]).toEqual(first.cursor);
  });

  it("resumes strictly after the cursor pair on the next tick", async () => {
    await seed([
      makeBookmark({ id: "01", domain: "x.com", tags: ["ai"] }),
      makeBookmark({ id: "02", domain: "x.com", tags: ["ai"] }),
      makeBookmark({ id: "03", domain: "x.com", tags: ["ai"] }),
      makeBookmark({ id: "04", domain: "x.com", tags: ["ai"] }),
    ]);

    const first = await runAutoEdgeSuggestSweep({ pairsPerTick: 3 });
    // First tick covered (01,02), (01,03), (01,04) => 3 pairs.
    expect(first.cursor).toEqual({ aId: "01", bId: "04" });
    expect(await listAllEdges()).toHaveLength(3);

    const second = await runAutoEdgeSuggestSweep({ pairsPerTick: 3 });
    // Second tick covered (02,03), (02,04), (03,04) => 3 pairs, completes.
    expect(second.pairsScanned).toBe(3);
    expect(second.completed).toBe(true);
    expect(second.cursor).toBeNull();
    expect(await listAllEdges()).toHaveLength(6);
  });

  it("clears the cursor when the last pair is processed within the tick", async () => {
    await seed([
      makeBookmark({ id: "01", domain: "x.com", tags: ["ai"] }),
      makeBookmark({ id: "02", domain: "x.com", tags: ["ai"] }),
      makeBookmark({ id: "03", domain: "x.com", tags: ["ai"] }),
    ]);
    // 3 bookmarks => 3 pairs. Tick size exactly matches.
    const res = await runAutoEdgeSuggestSweep({ pairsPerTick: 3 });
    expect(res.completed).toBe(true);
    expect(res.cursor).toBeNull();
    // biome-ignore lint/suspicious/noExplicitAny: chrome shim
    const stored = await (globalThis as any).chrome.storage.local.get(AUTO_EDGE_SUGGEST_CURSOR_KEY);
    expect(stored[AUTO_EDGE_SUGGEST_CURSOR_KEY]).toBeUndefined();
  });

  it("survives a bookmark added between ticks", async () => {
    await seed([
      makeBookmark({ id: "01", domain: "x.com", tags: ["ai"] }),
      makeBookmark({ id: "02", domain: "x.com", tags: ["ai"] }),
      makeBookmark({ id: "03", domain: "x.com", tags: ["ai"] }),
    ]);
    const first = await runAutoEdgeSuggestSweep({ pairsPerTick: 1 });
    expect(first.cursor).toEqual({ aId: "01", bId: "02" });

    // A new bookmark gets a lexicographically-later id — should not
    // rewind the scan.
    await seed([makeBookmark({ id: "99", domain: "x.com", tags: ["ai"] })]);

    const second = await runAutoEdgeSuggestSweep({ pairsPerTick: 100 });
    // Remaining pairs starting from (01,03): (01,03), (01,99),
    // (02,03), (02,99), (03,99) => 5 pairs.
    expect(second.pairsScanned).toBe(5);
    expect(second.completed).toBe(true);
    expect(await listAllEdges()).toHaveLength(6);
  });

  it("resets after a completed sweep so the next call starts fresh", async () => {
    await seed([
      makeBookmark({ id: "01", domain: "x.com", tags: ["ai"] }),
      makeBookmark({ id: "02", domain: "x.com", tags: ["ai"] }),
    ]);
    await runAutoEdgeSuggestSweep();
    // A second call should re-scan from the beginning, not skip the
    // single pair because the cursor is stale.
    const again = await runAutoEdgeSuggestSweep();
    expect(again.pairsScanned).toBe(1);
    expect(again.completed).toBe(true);
    // Same edge still exists — the second scan is a no-op write.
    expect(await listAllEdges()).toHaveLength(1);
  });

  it("resetAutoEdgeSuggestCursor clears a persisted cursor", async () => {
    await seed([
      makeBookmark({ id: "01", domain: "x.com", tags: ["ai"] }),
      makeBookmark({ id: "02", domain: "x.com", tags: ["ai"] }),
      makeBookmark({ id: "03", domain: "x.com", tags: ["ai"] }),
    ]);
    await runAutoEdgeSuggestSweep({ pairsPerTick: 1 });
    // biome-ignore lint/suspicious/noExplicitAny: chrome shim
    const stored1 = await (globalThis as any).chrome.storage.local.get(
      AUTO_EDGE_SUGGEST_CURSOR_KEY,
    );
    expect(stored1[AUTO_EDGE_SUGGEST_CURSOR_KEY]).toBeTruthy();

    await resetAutoEdgeSuggestCursor();
    // biome-ignore lint/suspicious/noExplicitAny: chrome shim
    const stored2 = await (globalThis as any).chrome.storage.local.get(
      AUTO_EDGE_SUGGEST_CURSOR_KEY,
    );
    expect(stored2[AUTO_EDGE_SUGGEST_CURSOR_KEY]).toBeUndefined();
  });
});
