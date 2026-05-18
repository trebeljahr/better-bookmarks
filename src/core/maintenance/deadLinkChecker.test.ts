import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bookmark, LinkCheckResult } from "../../shared/types";
import { upsertBookmark } from "../storage/bookmarks";
import { getDB, resetDBForTests } from "../storage/db";
import { checkBookmark, listDeadBookmarks, runDeadLinkSweep } from "./deadLinkChecker";

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

beforeEach(async () => {
  await getDB().bookmarks.clear();
});

afterEach(() => {
  resetDBForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("checkBookmark", () => {
  it("returns ok=true with httpStatus on 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200 })),
    );
    const r = await checkBookmark(makeBookmark());
    expect(r.ok).toBe(true);
    expect(r.httpStatus).toBe(200);
    expect(r.reason).toBeUndefined();
    expect(typeof r.checkedAt).toBe("number");
  });

  it("treats 3xx final response as ok (redirect followed)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 301 })),
    );
    const r = await checkBookmark(makeBookmark());
    expect(r.ok).toBe(true);
    expect(r.httpStatus).toBe(301);
  });

  it("returns ok=false reason=client-error on 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    const r = await checkBookmark(makeBookmark());
    expect(r.ok).toBe(false);
    expect(r.httpStatus).toBe(404);
    expect(r.reason).toBe("client-error");
  });

  it("returns ok=false reason=server-error on 500", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 500 })),
    );
    const r = await checkBookmark(makeBookmark());
    expect(r.ok).toBe(false);
    expect(r.httpStatus).toBe(500);
    expect(r.reason).toBe("server-error");
  });

  it("returns ok=false reason=network when fetch aborts (timeout)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const err = new DOMException("Timeout", "TimeoutError");
        throw err;
      }),
    );
    const r = await checkBookmark(makeBookmark());
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("network");
    expect(r.httpStatus).toBeUndefined();
  });

  it("returns ok=false reason=network on generic fetch throw", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const r = await checkBookmark(makeBookmark());
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("network");
  });

  it("passes HEAD + redirect:follow + signal to fetch", async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await checkBookmark(makeBookmark({ originalUrl: "https://foo.test/bar" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    const url = call[0] as string;
    const init = call[1] as RequestInit;
    expect(url).toBe("https://foo.test/bar");
    expect(init.method).toBe("HEAD");
    expect(init.redirect).toBe("follow");
    expect(init.signal).toBeInstanceOf(AbortSignal);
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

    const result = await runDeadLinkSweep();

    expect(result.checked).toBe(1);
    expect(result.dead).toBe(0);
    const after = await getDB().bookmarks.get(id);
    expect(after?.linkCheck?.ok).toBe(true);
    expect(after?.linkCheck?.httpStatus).toBe(200);
  });

  it("skips bookmarks whose linkCheck is fresher than staleAfterMs", async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const now = 1_000_000_000_000;
    const fresh = now - 1000;
    const stale = now - 100 * 24 * 60 * 60 * 1000;

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

    const result = await runDeadLinkSweep({ now, staleAfterMs: 30 * 24 * 60 * 60 * 1000 });

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

    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push(await seed(`https://e${i}.test/`));
    }

    const result = await runDeadLinkSweep({ limit: 2, concurrency: 2 });

    expect(result.checked).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("counts dead bookmarks correctly", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        if (call === 1) return new Response(null, { status: 200 });
        if (call === 2) return new Response(null, { status: 404 });
        return new Response(null, { status: 500 });
      }),
    );

    await seed("https://a.test/");
    await seed("https://b.test/");
    await seed("https://c.test/");

    const result = await runDeadLinkSweep({ concurrency: 1 });
    expect(result.checked).toBe(3);
    expect(result.dead).toBe(2);
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

    await runDeadLinkSweep({ concurrency: 2 });
    expect(maxInflight).toBeLessThanOrEqual(2);
    expect(maxInflight).toBeGreaterThan(0);
  });
});

describe("listDeadBookmarks", () => {
  it("returns only bookmarks where linkCheck.ok === false", async () => {
    const a = await upsertBookmark({ rawUrl: "https://a.test/", title: "a" });
    const b = await upsertBookmark({ rawUrl: "https://b.test/", title: "b" });
    const c = await upsertBookmark({ rawUrl: "https://c.test/", title: "c" });
    const d = await upsertBookmark({ rawUrl: "https://d.test/", title: "d" });
    if (!a.ok || !b.ok || !c.ok || !d.ok) throw new Error("seed");

    await getDB().bookmarks.put({
      ...a.bookmark,
      linkCheck: { checkedAt: 1, ok: true, httpStatus: 200 },
    });
    await getDB().bookmarks.put({
      ...b.bookmark,
      linkCheck: { checkedAt: 1, ok: false, httpStatus: 404, reason: "client-error" },
    });
    await getDB().bookmarks.put({
      ...c.bookmark,
      linkCheck: { checkedAt: 1, ok: false, reason: "network" },
    });

    const dead = await listDeadBookmarks();
    const urls = dead.map((bm) => bm.canonicalUrl).sort();
    expect(urls).toEqual(["https://b.test/", "https://c.test/"]);
    expect(dead.find((bm) => bm.canonicalUrl === "https://a.test/")).toBeUndefined();
    expect(dead.find((bm) => bm.canonicalUrl === "https://d.test/")).toBeUndefined();
  });
});
