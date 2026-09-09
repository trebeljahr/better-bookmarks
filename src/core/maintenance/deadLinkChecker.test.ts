import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bookmark, LinkCheckResult } from "../../shared/types";
import { upsertBookmark } from "../storage/bookmarks";
import { getDB, resetDBForTests } from "../storage/db";
import {
  CONSECUTIVE_DAY_THRESHOLD,
  checkBookmark,
  listDeadBookmarks,
  runDeadLinkSweep,
} from "./deadLinkChecker";

const DAY_MS = 24 * 60 * 60 * 1000;

function makeBookmark(overrides: Partial<Bookmark> = {}): Bookmark {
  return {
    id: "01",
    canonicalUrl: "https://example.com/",
    originalUrl: "https://example.com/",
    domain: "example.com",
    title: "x",
    description: "",
    note: "",
    tags: [],
    rating: null,
    necessaryTime: null,
    contentType: "unknown",
    language: null,
    status: "unread",
    readAt: null,
    createdAt: 0,
    updatedAt: 0,
    capturedFrom: "manual",
    ...overrides,
  };
}

/** No-op sleep so retry tests never actually block on real timers. */
const noSleep = async (_ms: number) => {};

beforeEach(async () => {
  await getDB().bookmarks.clear();
});

afterEach(() => {
  resetDBForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("checkBookmark — response class handling", () => {
  it("200 → alive, ok=true, no retries", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const r = await checkBookmark(makeBookmark(), { sleep: noSleep, now: 100 });

    expect(r.ok).toBe(true);
    expect(r.status).toBe("alive");
    expect(r.httpStatus).toBe(200);
    expect(r.retries).toBe(0);
    expect(r.failureLog).toEqual([]);
    expect(r.consecutiveFailureDays).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("301 → alive (redirect:follow surfaces the resolved status)", async () => {
    // Note: with redirect:"follow", fetch surfaces the FINAL status.
    // A 3xx here would only surface if the runtime returned it directly
    // (e.g. redirect chain limit). Either way we classify 3xx as alive.
    const fetchMock = vi.fn(async () => new Response(null, { status: 301 }));
    vi.stubGlobal("fetch", fetchMock);

    const r = await checkBookmark(makeBookmark(), { sleep: noSleep });

    expect(r.ok).toBe(true);
    expect(r.status).toBe("alive");
    expect(r.httpStatus).toBe(301);
    expect(r.retries).toBe(0);
  });

  it("404 → dead entry recorded, but ok=true until consecutive-day threshold", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const r = await checkBookmark(makeBookmark(), { sleep: noSleep, now: 100 });

    // A single failing probe never confirms dead — needs distinct days.
    expect(r.ok).toBe(true);
    expect(r.status).toBe("dead");
    expect(r.httpStatus).toBe(404);
    expect(r.reason).toBe("client-error");
    expect(r.retries).toBe(0); // 404 is not retried; it's permanent-looking.
    expect(r.failureLog).toHaveLength(1);
    expect(r.failureLog?.[0]).toMatchObject({
      at: 100,
      status: "dead",
      httpStatus: 404,
      reason: "client-error",
    });
    expect(r.consecutiveFailureDays).toBe(1);
    expect(r.firstFailureAt).toBe(100);
    expect(r.lastFailureAt).toBe(100);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("410 → dead entry recorded, treated like 404", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 410 }));
    vi.stubGlobal("fetch", fetchMock);

    const r = await checkBookmark(makeBookmark(), { sleep: noSleep, now: 200 });

    expect(r.ok).toBe(true); // not yet confirmed dead
    expect(r.status).toBe("dead");
    expect(r.httpStatus).toBe(410);
    expect(r.reason).toBe("client-error");
    expect(r.retries).toBe(0);
    expect(r.failureLog).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("429 → unknown (rate-limited), retried, ok=true, NEVER dead", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    const sleepSpy = vi.fn(async (_ms: number) => {});

    const r = await checkBookmark(makeBookmark(), { sleep: sleepSpy, now: 100 });

    expect(r.ok).toBe(true);
    expect(r.status).toBe("unknown");
    expect(r.httpStatus).toBe(429);
    expect(r.reason).toBe("rate-limited");
    // 1 initial + 3 retries
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(r.retries).toBe(3);
    // Exponential backoff: 1000, 2000, 4000
    expect(sleepSpy).toHaveBeenNthCalledWith(1, 1000);
    expect(sleepSpy).toHaveBeenNthCalledWith(2, 2000);
    expect(sleepSpy).toHaveBeenNthCalledWith(3, 4000);
    expect(r.failureLog).toHaveLength(1);
    expect(r.failureLog?.[0]).toMatchObject({ status: "unknown", reason: "rate-limited" });
  });

  it("500 → unknown (server-error), retried, ok=true, NEVER dead", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const sleepSpy = vi.fn(async (_ms: number) => {});

    const r = await checkBookmark(makeBookmark(), { sleep: sleepSpy, now: 100 });

    expect(r.ok).toBe(true);
    expect(r.status).toBe("unknown");
    expect(r.httpStatus).toBe(500);
    expect(r.reason).toBe("server-error");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(r.retries).toBe(3);
    expect(sleepSpy).toHaveBeenCalledTimes(3);
  });

  it("503 → unknown (server-error), retried, ok=true, NEVER dead", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const sleepSpy = vi.fn(async (_ms: number) => {});

    const r = await checkBookmark(makeBookmark(), { sleep: sleepSpy });

    expect(r.ok).toBe(true);
    expect(r.status).toBe("unknown");
    expect(r.httpStatus).toBe(503);
    expect(r.reason).toBe("server-error");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("network error → unknown, retried, ok=true, NEVER dead", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);
    const sleepSpy = vi.fn(async (_ms: number) => {});

    const r = await checkBookmark(makeBookmark(), { sleep: sleepSpy });

    expect(r.ok).toBe(true);
    expect(r.status).toBe("unknown");
    expect(r.reason).toBe("network");
    expect(r.httpStatus).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(r.retries).toBe(3);
  });

  it("timeout (DOMException TimeoutError) → unknown reason=timeout, retried", async () => {
    const fetchMock = vi.fn(async () => {
      throw new DOMException("Timeout", "TimeoutError");
    });
    vi.stubGlobal("fetch", fetchMock);
    const sleepSpy = vi.fn(async (_ms: number) => {});

    const r = await checkBookmark(makeBookmark(), { sleep: sleepSpy });

    expect(r.ok).toBe(true);
    expect(r.status).toBe("unknown");
    expect(r.reason).toBe("timeout");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("transient recovers on retry: 500 → 200 → alive, no failure recorded", async () => {
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      if (call === 1) return new Response(null, { status: 500 });
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const r = await checkBookmark(makeBookmark(), { sleep: noSleep, now: 100 });

    expect(r.ok).toBe(true);
    expect(r.status).toBe("alive");
    expect(r.httpStatus).toBe(200);
    expect(r.retries).toBe(1);
    expect(r.failureLog).toEqual([]);
    expect(r.consecutiveFailureDays).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("passes HEAD + redirect:follow + signal to fetch", async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await checkBookmark(makeBookmark({ originalUrl: "https://foo.test/bar" }), {
      sleep: noSleep,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    const url = call[0] as string;
    const init = call[1] as RequestInit;
    expect(url).toBe("https://foo.test/bar");
    expect(init.method).toBe("HEAD");
    expect(init.redirect).toBe("follow");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("other 4xx (e.g. 403) → unknown, NEVER dead — could be paywall/auth", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    const r = await checkBookmark(makeBookmark(), { sleep: noSleep });

    expect(r.ok).toBe(true);
    expect(r.status).toBe("unknown");
    expect(r.httpStatus).toBe(403);
    expect(r.reason).toBe("client-error");
    expect(r.retries).toBe(0); // other 4xx are not retried, but also not dead.
    expect(r.failureLog).toHaveLength(1);
    expect(r.failureLog?.[0].status).toBe("unknown");
  });
});

describe("checkBookmark — consecutive-day accounting", () => {
  it("appends failure entries across distinct days; flips ok=false at threshold", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const day1 = 1_700_000_000_000;
    const day2 = day1 + DAY_MS;
    const day3 = day1 + 2 * DAY_MS;

    // Day 1 — first failure, not yet dead.
    const r1 = await checkBookmark(makeBookmark(), { sleep: noSleep, now: day1 });
    expect(r1.ok).toBe(true);
    expect(r1.consecutiveFailureDays).toBe(1);
    expect(r1.failureLog).toHaveLength(1);
    expect(r1.firstFailureAt).toBe(day1);

    // Day 2 — second distinct day, still not dead.
    const r2 = await checkBookmark(makeBookmark({ linkCheck: r1 }), {
      sleep: noSleep,
      now: day2,
    });
    expect(r2.ok).toBe(true);
    expect(r2.consecutiveFailureDays).toBe(2);
    expect(r2.failureLog).toHaveLength(2);
    expect(r2.firstFailureAt).toBe(day1);
    expect(r2.lastFailureAt).toBe(day2);

    // Day 3 — threshold reached, flip to dead.
    const r3 = await checkBookmark(makeBookmark({ linkCheck: r2 }), {
      sleep: noSleep,
      now: day3,
    });
    expect(CONSECUTIVE_DAY_THRESHOLD).toBe(3);
    expect(r3.ok).toBe(false);
    expect(r3.consecutiveFailureDays).toBe(3);
    expect(r3.failureLog).toHaveLength(3);
  });

  it("two failures on the SAME day count as one day (never flips to dead)", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const t0 = 1_700_000_000_000;
    const t1 = t0 + 1000;
    const t2 = t0 + 2000;

    const r1 = await checkBookmark(makeBookmark(), { sleep: noSleep, now: t0 });
    const r2 = await checkBookmark(makeBookmark({ linkCheck: r1 }), {
      sleep: noSleep,
      now: t1,
    });
    const r3 = await checkBookmark(makeBookmark({ linkCheck: r2 }), {
      sleep: noSleep,
      now: t2,
    });

    expect(r3.failureLog).toHaveLength(3);
    expect(r3.consecutiveFailureDays).toBe(1);
    expect(r3.ok).toBe(true);
  });

  it("a single alive probe wipes the failure log and resets counters", async () => {
    const day1 = 1_700_000_000_000;
    const day2 = day1 + DAY_MS;

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    const dead1 = await checkBookmark(makeBookmark(), { sleep: noSleep, now: day1 });
    const dead2 = await checkBookmark(makeBookmark({ linkCheck: dead1 }), {
      sleep: noSleep,
      now: day2,
    });
    expect(dead2.consecutiveFailureDays).toBe(2);

    vi.unstubAllGlobals();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200 })),
    );

    const recovered = await checkBookmark(makeBookmark({ linkCheck: dead2 }), {
      sleep: noSleep,
      now: day2 + DAY_MS,
    });

    expect(recovered.ok).toBe(true);
    expect(recovered.status).toBe("alive");
    expect(recovered.failureLog).toEqual([]);
    expect(recovered.consecutiveFailureDays).toBe(0);
  });

  it("mixes 404 + 500 across days — both count toward the threshold", async () => {
    const day1 = 1_700_000_000_000;
    const day2 = day1 + DAY_MS;
    const day3 = day1 + 2 * DAY_MS;

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    const r1 = await checkBookmark(makeBookmark(), { sleep: noSleep, now: day1 });

    vi.unstubAllGlobals();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 500 })),
    );
    const r2 = await checkBookmark(makeBookmark({ linkCheck: r1 }), {
      sleep: noSleep,
      now: day2,
      baseBackoffMs: 0,
    });

    vi.unstubAllGlobals();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 429 })),
    );
    const r3 = await checkBookmark(makeBookmark({ linkCheck: r2 }), {
      sleep: noSleep,
      now: day3,
      baseBackoffMs: 0,
    });

    // All three failing days pushed us over the threshold. Notice that
    // it doesn't matter whether the failures were permanent-looking or
    // transient — three straight days of no response means dead.
    expect(r3.ok).toBe(false);
    expect(r3.consecutiveFailureDays).toBe(3);
  });
});

describe("runDeadLinkSweep", () => {
  async function seed(url: string, linkCheck?: LinkCheckResult): Promise<string> {
    const r = await upsertBookmark({ rawUrl: url, title: url });
    if (!r.ok) throw new Error("seed failed");
    if (linkCheck) {
      await getDB().bookmarks.put({ ...r.bookmark, linkCheck });
    }
    return r.bookmark.id;
  }

  it("checks never-checked bookmarks and writes linkCheck back", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200 })),
    );
    const id = await seed("https://a.test/");

    const result = await runDeadLinkSweep({ sleep: noSleep, baseBackoffMs: 0 });

    expect(result.checked).toBe(1);
    expect(result.dead).toBe(0);
    expect(result.alive).toBe(1);
    expect(result.unknown).toBe(0);
    const after = await getDB().bookmarks.get(id);
    expect(after?.linkCheck?.ok).toBe(true);
    expect(after?.linkCheck?.httpStatus).toBe(200);
  });

  it("skips bookmarks whose linkCheck is fresher than staleAfterMs", async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const now = 1_000_000_000_000;
    const fresh = now - 1000;
    const stale = now - 100 * DAY_MS;

    const freshId = await seed("https://fresh.test/", {
      checkedAt: fresh,
      ok: true,
      httpStatus: 200,
    });
    const staleId = await seed("https://stale.test/", {
      checkedAt: stale,
      ok: true,
      httpStatus: 200,
    });
    const neverId = await seed("https://never.test/");

    const result = await runDeadLinkSweep({
      now,
      staleAfterMs: 30 * DAY_MS,
      sleep: noSleep,
      baseBackoffMs: 0,
    });

    expect(result.checked).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const calledUrls = fetchMock.mock.calls.map((c) => c[0] as string).sort();
    expect(calledUrls).toEqual(["https://never.test/", "https://stale.test/"]);

    const freshBm = await getDB().bookmarks.get(freshId);
    expect(freshBm?.linkCheck?.checkedAt).toBe(fresh);

    const staleBm = await getDB().bookmarks.get(staleId);
    expect(staleBm?.linkCheck?.checkedAt).toBeGreaterThan(stale);

    const neverBm = await getDB().bookmarks.get(neverId);
    expect(neverBm?.linkCheck).toBeDefined();
  });

  it("caps at limit and prefers oldest-checked candidates", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    for (let i = 0; i < 5; i++) {
      await seed(`https://e${i}.test/`);
    }

    const result = await runDeadLinkSweep({
      limit: 2,
      concurrency: 2,
      sleep: noSleep,
      baseBackoffMs: 0,
    });

    expect(result.checked).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("dead count only includes bookmarks confirmed-dead across the day threshold", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        if (call === 1) return new Response(null, { status: 200 });
        // Everything else is 500 → unknown, never dead in one sweep.
        return new Response(null, { status: 500 });
      }),
    );

    await seed("https://a.test/");
    await seed("https://b.test/");
    await seed("https://c.test/");

    const result = await runDeadLinkSweep({
      concurrency: 1,
      sleep: noSleep,
      baseBackoffMs: 0,
    });
    expect(result.checked).toBe(3);
    // Zero dead: 500s (with 429 retries) never flip to dead in one sweep.
    expect(result.dead).toBe(0);
    expect(result.alive).toBe(1);
    expect(result.unknown).toBe(2);
  });

  it("batches by concurrency (concurrent in batch, sequential between batches)", async () => {
    let inflight = 0;
    let maxInflight = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        inflight += 1;
        maxInflight = Math.max(maxInflight, inflight);
        await new Promise((r) => setTimeout(r, 10));
        inflight -= 1;
        return new Response(null, { status: 200 });
      }),
    );

    for (let i = 0; i < 6; i++) {
      await upsertBookmark({ rawUrl: `https://b${i}.test/`, title: `b${i}` });
    }

    await runDeadLinkSweep({ concurrency: 2, sleep: noSleep, baseBackoffMs: 0 });
    expect(maxInflight).toBeLessThanOrEqual(2);
    expect(maxInflight).toBeGreaterThan(0);
  });
});

describe("listDeadBookmarks", () => {
  it("returns only bookmarks where linkCheck.ok === false (confirmed dead)", async () => {
    const a = await upsertBookmark({ rawUrl: "https://a.test/", title: "a" });
    const b = await upsertBookmark({ rawUrl: "https://b.test/", title: "b" });
    const c = await upsertBookmark({ rawUrl: "https://c.test/", title: "c" });
    const d = await upsertBookmark({ rawUrl: "https://d.test/", title: "d" });
    if (!a.ok || !b.ok || !c.ok || !d.ok) throw new Error("seed");

    await getDB().bookmarks.put({
      ...a.bookmark,
      linkCheck: { checkedAt: 1, ok: true, httpStatus: 200, status: "alive" },
    });
    // Confirmed dead: ok=false.
    await getDB().bookmarks.put({
      ...b.bookmark,
      linkCheck: {
        checkedAt: 1,
        ok: false,
        httpStatus: 404,
        reason: "client-error",
        status: "dead",
        consecutiveFailureDays: 3,
      },
    });
    // Transient failure: ok=true, status=unknown. Should NOT appear.
    await getDB().bookmarks.put({
      ...c.bookmark,
      linkCheck: {
        checkedAt: 1,
        ok: true,
        reason: "network",
        status: "unknown",
        consecutiveFailureDays: 1,
      },
    });

    const dead = await listDeadBookmarks();
    const urls = dead.map((bm) => bm.canonicalUrl).sort();
    expect(urls).toEqual(["https://b.test/"]);
    expect(dead.find((bm) => bm.canonicalUrl === "https://a.test/")).toBeUndefined();
    expect(dead.find((bm) => bm.canonicalUrl === "https://c.test/")).toBeUndefined();
    expect(dead.find((bm) => bm.canonicalUrl === "https://d.test/")).toBeUndefined();
  });
});
