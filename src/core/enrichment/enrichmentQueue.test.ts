import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bookmark } from "../../shared/types";
import { upsertBookmark } from "../storage/bookmarks";
import { getDB, resetDBForTests } from "../storage/db";
import type { EnrichResult } from "./enrich";
import {
  _configureEnrichmentQueueForTests,
  _peekEnrichmentQueueForTests,
  _resetEnrichmentQueueForTests,
  enqueueEnrichment,
  runEnrichmentSweep,
} from "./enrichmentQueue";

async function seed(rawUrl: string, patch: Partial<Bookmark> = {}): Promise<Bookmark> {
  const r = await upsertBookmark({ rawUrl });
  if (!r.ok) throw new Error("seed failed");
  if (Object.keys(patch).length > 0) {
    await getDB().bookmarks.update(r.bookmark.id, patch);
    return (await getDB().bookmarks.get(r.bookmark.id)) as Bookmark;
  }
  return r.bookmark;
}

beforeEach(async () => {
  await getDB().bookmarks.clear();
  _resetEnrichmentQueueForTests();
});

afterEach(() => {
  _resetEnrichmentQueueForTests();
  resetDBForTests();
});

describe("enqueueEnrichment", () => {
  it("processes queued ids and respects concurrency cap of 2", async () => {
    const bm1 = await seed("https://a.example/1");
    const bm2 = await seed("https://b.example/2");
    const bm3 = await seed("https://c.example/3");

    let active = 0;
    let maxActive = 0;
    const calls: string[] = [];

    _configureEnrichmentQueueForTests({
      concurrency: 2,
      delayMs: 0,
      enrich: async (b) => {
        active++;
        maxActive = Math.max(maxActive, active);
        calls.push(b.id);
        await new Promise((r) => setTimeout(r, 10));
        active--;
        return { updated: true } satisfies EnrichResult;
      },
    });

    enqueueEnrichment(bm1.id);
    enqueueEnrichment(bm2.id);
    enqueueEnrichment(bm3.id);

    await vi.waitFor(
      () => {
        expect(calls.length).toBe(3);
      },
      { timeout: 2000 },
    );
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("dedupes already-pending ids", async () => {
    const bm = await seed("https://a.example/1");
    const calls: string[] = [];
    _configureEnrichmentQueueForTests({
      concurrency: 1,
      delayMs: 0,
      enrich: async (b) => {
        calls.push(b.id);
        return { updated: true };
      },
    });
    enqueueEnrichment(bm.id);
    enqueueEnrichment(bm.id);
    enqueueEnrichment(bm.id);
    await vi.waitFor(
      () => {
        expect(calls.length).toBeGreaterThanOrEqual(1);
      },
      { timeout: 1000 },
    );
    await new Promise((r) => setTimeout(r, 30));
    expect(calls.length).toBe(1);
  });

  it("backs off the same domain after a network failure", async () => {
    const a1 = await seed("https://failing.example/1");
    const a2 = await seed("https://failing.example/2");
    const calls: string[] = [];

    _configureEnrichmentQueueForTests({
      concurrency: 1,
      delayMs: 0,
      enrich: async (b) => {
        calls.push(b.id);
        return { updated: false, reason: "network" };
      },
    });

    enqueueEnrichment(a1.id);
    await vi.waitFor(
      () => {
        const peek = _peekEnrichmentQueueForTests();
        expect(calls.length).toBeGreaterThanOrEqual(1);
        expect(peek.backoff.length).toBe(1);
      },
      { timeout: 1000 },
    );
    enqueueEnrichment(a2.id);
    // a2 is from same domain that's now in cooldown — should be dropped, not enriched.
    await new Promise((r) => setTimeout(r, 50));
    expect(calls.filter((id) => id === a1.id).length).toBe(1);
    expect(calls.filter((id) => id === a2.id).length).toBe(0);
    const peek = _peekEnrichmentQueueForTests();
    expect(peek.backoff[0][0]).toBe("failing.example");
  });

  it("clears backoff on success", async () => {
    const bm = await seed("https://recover.example/1");
    _configureEnrichmentQueueForTests({
      concurrency: 1,
      delayMs: 0,
      enrich: async () => ({ updated: true }),
    });
    enqueueEnrichment(bm.id);
    await vi.waitFor(
      () => {
        const peek = _peekEnrichmentQueueForTests();
        expect(peek.pending.length + peek.inFlight.length).toBe(0);
      },
      { timeout: 1000 },
    );
    expect(_peekEnrichmentQueueForTests().backoff.length).toBe(0);
  });
});

describe("runEnrichmentSweep", () => {
  it("enriches bookmarks with no enrichedAt", async () => {
    await seed("https://a.example/1");
    await seed("https://b.example/2");
    const ids: string[] = [];
    _configureEnrichmentQueueForTests({
      enrich: async (b) => {
        ids.push(b.id);
        return { updated: true };
      },
    });
    const result = await runEnrichmentSweep({ limit: 10 });
    expect(result.enriched).toBe(2);
    expect(result.skipped).toBe(0);
    expect(ids.length).toBe(2);
  });

  it("skips bookmarks whose enrichedAt is fresh", async () => {
    const now = 1_000_000_000_000;
    await seed("https://a.example/1", { enrichedAt: now - 1000 });
    await seed("https://b.example/2", { enrichedAt: now - 5 * 24 * 60 * 60 * 1000 });
    let count = 0;
    _configureEnrichmentQueueForTests({
      enrich: async () => {
        count++;
        return { updated: true };
      },
    });
    const result = await runEnrichmentSweep({
      limit: 10,
      staleAfterMs: 7 * 24 * 60 * 60 * 1000,
      now,
    });
    expect(count).toBe(0);
    expect(result.enriched).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it("includes bookmarks older than staleAfterMs", async () => {
    const now = 1_000_000_000_000;
    await seed("https://a.example/1", { enrichedAt: now - 200 * 24 * 60 * 60 * 1000 });
    await seed("https://b.example/2", { enrichedAt: now - 100 });
    let count = 0;
    _configureEnrichmentQueueForTests({
      enrich: async () => {
        count++;
        return { updated: true };
      },
    });
    const result = await runEnrichmentSweep({
      limit: 10,
      staleAfterMs: 90 * 24 * 60 * 60 * 1000,
      now,
    });
    expect(count).toBe(1);
    expect(result.enriched).toBe(1);
  });

  it("respects the limit option", async () => {
    for (let i = 0; i < 5; i++) {
      await seed(`https://a.example/${i}`);
    }
    let count = 0;
    _configureEnrichmentQueueForTests({
      enrich: async () => {
        count++;
        return { updated: true };
      },
    });
    const result = await runEnrichmentSweep({ limit: 3 });
    expect(result.enriched).toBe(3);
    expect(count).toBe(3);
  });

  it("counts skipped when enrich returns updated:false", async () => {
    await seed("https://a.example/1");
    await seed("https://b.example/2");
    _configureEnrichmentQueueForTests({
      enrich: async () => ({ updated: false, reason: "non-html" }),
    });
    const result = await runEnrichmentSweep({ limit: 10 });
    expect(result.enriched).toBe(0);
    expect(result.skipped).toBe(2);
  });

  it("counts skipped when enrich throws", async () => {
    await seed("https://a.example/1");
    _configureEnrichmentQueueForTests({
      enrich: async () => {
        throw new Error("boom");
      },
    });
    const result = await runEnrichmentSweep({ limit: 10 });
    expect(result.enriched).toBe(0);
    expect(result.skipped).toBe(1);
  });
});
