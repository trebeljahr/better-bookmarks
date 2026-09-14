import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bookmark } from "../../shared/types";
import { deleteBookmark, updateBookmark, upsertBookmark } from "../storage/bookmarks";
import { getDB, resetDBForTests, type SearchIndexRow } from "../storage/db";
import { buildInvertedIndex } from "./indexer";
import {
  ensureInvertedIndexInitialized,
  pendingInvertedIndexTimersForTests,
  resetInvertedWiringForTests,
  wireInvertedIndexer,
} from "./wire";

// Fake-indexeddb schedules work through `setImmediate` in Node, so we only
// fake `setTimeout`/`clearTimeout` — the debounce timers — and leave every
// other scheduler alone so Dexie transactions still commit.
function useDebounceFakeTimers(): void {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
}

async function flushMicrotasks(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

// Advance the debounce timer by `ms` real-milliseconds and drain the awaited
// work the debounce callback kicks off (Dexie get / transaction / bulkPut,
// all routed through the real `setImmediate`).
async function tick(ms: number): Promise<void> {
  vi.advanceTimersByTime(ms);
  // Let the debounce callback start, then wait real time for fake-indexeddb's
  // setImmediate-scheduled work to settle.
  await new Promise((resolve) => setImmediate(resolve));
  await flushMicrotasks();
  await new Promise((resolve) => setImmediate(resolve));
  await flushMicrotasks();
}

async function rowsFor(bookmarkId: string): Promise<SearchIndexRow[]> {
  return getDB().searchIndex.where("bookmarkId").equals(bookmarkId).toArray();
}

function makeBookmark(overrides: Partial<Bookmark> = {}): Bookmark {
  const now = Date.now();
  return {
    id: "01SEED",
    canonicalUrl: "https://example.com/",
    originalUrl: "https://example.com/",
    domain: "example.com",
    title: "",
    description: "",
    note: "",
    tags: [],
    rating: null,
    necessaryTime: null,
    contentType: "unknown",
    language: null,
    status: "unread",
    readAt: null,
    createdAt: now,
    updatedAt: now,
    capturedFrom: "manual",
    ...overrides,
  };
}

beforeEach(async () => {
  resetInvertedWiringForTests();
  const db = getDB();
  await db.bookmarks.clear();
  await db.searchIndex.clear();
  await db.postings.clear();
});

afterEach(() => {
  vi.useRealTimers();
  resetDBForTests();
  resetInvertedWiringForTests();
});

describe("wireInvertedIndexer (debounced)", () => {
  it("does not write before the 200ms debounce elapses", async () => {
    useDebounceFakeTimers();
    wireInvertedIndexer();
    const r = await upsertBookmark({
      rawUrl: "https://example.com/a",
      title: "hello world",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("setup");

    await tick(199);
    expect(await rowsFor(r.bookmark.id)).toHaveLength(0);
    expect(pendingInvertedIndexTimersForTests()).toBe(1);

    await tick(1);
    const rows = await rowsFor(r.bookmark.id);
    expect(rows.length).toBeGreaterThan(0);
    const terms = new Set(rows.map((row) => row.term));
    expect(terms.has("hello")).toBe(true);
    expect(terms.has("world")).toBe(true);
    expect(pendingInvertedIndexTimersForTests()).toBe(0);
  });

  it("collapses rapid updates for one bookmark into a single flush", async () => {
    useDebounceFakeTimers();
    wireInvertedIndexer();
    const r = await upsertBookmark({
      rawUrl: "https://example.com/rapid",
      title: "one",
    });
    if (!r.ok) throw new Error("setup");

    // Three edits within the 200ms window — the debounce should coalesce
    // them and only the final title should end up indexed.
    await tick(50);
    await updateBookmark(r.bookmark.id, { title: "two" });
    await tick(50);
    await updateBookmark(r.bookmark.id, { title: "three" });
    await tick(50);
    await updateBookmark(r.bookmark.id, { title: "four" });

    // Still inside the debounce window relative to the last update.
    expect(pendingInvertedIndexTimersForTests()).toBe(1);
    await tick(199);
    expect(await rowsFor(r.bookmark.id)).toHaveLength(0);

    await tick(1);
    const rows = await rowsFor(r.bookmark.id);
    const terms = new Set(rows.map((row) => row.term));
    expect(terms.has("four")).toBe(true);
    // The stale titles must not be in the store.
    expect(terms.has("one")).toBe(false);
    expect(terms.has("two")).toBe(false);
    expect(terms.has("three")).toBe(false);
  });

  it("removes rows from the index when a bookmark is deleted", async () => {
    useDebounceFakeTimers();
    wireInvertedIndexer();
    const r = await upsertBookmark({
      rawUrl: "https://example.com/gone",
      title: "farewell",
    });
    if (!r.ok) throw new Error("setup");
    await tick(200);
    expect((await rowsFor(r.bookmark.id)).length).toBeGreaterThan(0);

    await deleteBookmark(r.bookmark.id);
    await tick(200);
    expect(await rowsFor(r.bookmark.id)).toHaveLength(0);
  });

  it("create-then-delete inside the debounce window results in no rows", async () => {
    useDebounceFakeTimers();
    wireInvertedIndexer();
    const r = await upsertBookmark({
      rawUrl: "https://example.com/ephemeral",
      title: "blip",
    });
    if (!r.ok) throw new Error("setup");
    await tick(50);
    await deleteBookmark(r.bookmark.id);
    await tick(200);
    expect(await rowsFor(r.bookmark.id)).toHaveLength(0);
  });

  it("keeps per-bookmark debounces independent", async () => {
    useDebounceFakeTimers();
    wireInvertedIndexer();
    const a = await upsertBookmark({ rawUrl: "https://a.example/", title: "alpha" });
    const b = await upsertBookmark({ rawUrl: "https://b.example/", title: "beta" });
    if (!a.ok || !b.ok) throw new Error("setup");
    expect(pendingInvertedIndexTimersForTests()).toBe(2);
    await tick(200);
    expect(pendingInvertedIndexTimersForTests()).toBe(0);
    expect((await rowsFor(a.bookmark.id)).some((r) => r.term === "alpha")).toBe(true);
    expect((await rowsFor(b.bookmark.id)).some((r) => r.term === "beta")).toBe(true);
  });

  it("is idempotent — multiple wire calls only register hooks once", async () => {
    useDebounceFakeTimers();
    wireInvertedIndexer();
    wireInvertedIndexer();
    wireInvertedIndexer();
    const r = await upsertBookmark({ rawUrl: "https://example.com/once", title: "once" });
    if (!r.ok) throw new Error("setup");
    await tick(200);
    const rows = await rowsFor(r.bookmark.id);
    // Expected row count = size of the pure buildInvertedIndex output.
    const expected = buildInvertedIndex(r.bookmark);
    expect(rows).toHaveLength(expected.length);
  });
});

describe("ensureInvertedIndexInitialized", () => {
  it("triggers fullReindex when the store is empty and bookmarks exist", async () => {
    const db = getDB();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      // Two real bookmarks, no searchIndex rows.
      await db.bookmarks.bulkPut([
        makeBookmark({
          id: "01AAA",
          canonicalUrl: "https://a.example/",
          originalUrl: "https://a.example/",
          domain: "a.example",
          title: "backfill me",
        }),
        makeBookmark({
          id: "01BBB",
          canonicalUrl: "https://b.example/",
          originalUrl: "https://b.example/",
          domain: "b.example",
          title: "also backfill",
        }),
      ]);
      expect(await db.searchIndex.count()).toBe(0);

      await ensureInvertedIndexInitialized();

      expect(await db.searchIndex.count()).toBeGreaterThan(0);
      const backfilled = info.mock.calls.some((args) =>
        String(args[0] ?? "").includes("inverted index thin"),
      );
      const completed = info.mock.calls.some((args) =>
        String(args[0] ?? "").includes("fullReindex complete"),
      );
      expect(backfilled).toBe(true);
      expect(completed).toBe(true);
    } finally {
      info.mockRestore();
    }
  });

  it("no-ops when the store already meets the 0.5x heuristic", async () => {
    const db = getDB();
    // Mock the counts so we don't need to seed a fully-indexed corpus.
    const bookmarksCount = vi.spyOn(db.bookmarks, "count").mockResolvedValue(100);
    const indexCount = vi.spyOn(db.searchIndex, "count").mockResolvedValue(60);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      await ensureInvertedIndexInitialized();
      expect(bookmarksCount).toHaveBeenCalled();
      expect(indexCount).toHaveBeenCalled();
      const backfilled = info.mock.calls.some((args) =>
        String(args[0] ?? "").includes("inverted index thin"),
      );
      expect(backfilled).toBe(false);
    } finally {
      bookmarksCount.mockRestore();
      indexCount.mockRestore();
      info.mockRestore();
    }
  });

  it("triggers reindex when index rows are below the 0.5x heuristic", async () => {
    const db = getDB();
    // 100 bookmarks but only 40 searchIndex rows: 40 < 100 * 0.5 → rebuild.
    const bookmarksCount = vi.spyOn(db.bookmarks, "count").mockResolvedValue(100);
    const indexCount = vi.spyOn(db.searchIndex, "count").mockResolvedValue(40);

    // Seed real bookmarks for the actual fullReindex walk (which reads
    // from the bookmarks table) — 3 rows is enough to observe the write.
    await db.bookmarks.bulkPut([
      makeBookmark({
        id: "01X",
        canonicalUrl: "https://x.example/",
        originalUrl: "https://x.example/",
        domain: "x.example",
        title: "one",
      }),
      makeBookmark({
        id: "01Y",
        canonicalUrl: "https://y.example/",
        originalUrl: "https://y.example/",
        domain: "y.example",
        title: "two",
      }),
      makeBookmark({
        id: "01Z",
        canonicalUrl: "https://z.example/",
        originalUrl: "https://z.example/",
        domain: "z.example",
        title: "three",
      }),
    ]);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      await ensureInvertedIndexInitialized();
      const backfilled = info.mock.calls.some((args) =>
        String(args[0] ?? "").includes("inverted index thin"),
      );
      expect(backfilled).toBe(true);
      // After the mocked count returns 40 we still cleared the store and
      // wrote real rows for the 3 seeded bookmarks — count is no longer
      // mocked once the check is past, so the actual table has data.
      expect(await getDB().searchIndex.count()).toBeGreaterThan(0);
    } finally {
      bookmarksCount.mockRestore();
      indexCount.mockRestore();
      info.mockRestore();
    }
  });

  it("returns the same promise across concurrent callers", async () => {
    const db = getDB();
    const bookmarksCount = vi.spyOn(db.bookmarks, "count").mockResolvedValue(10);
    const indexCount = vi.spyOn(db.searchIndex, "count").mockResolvedValue(8);
    try {
      const p1 = ensureInvertedIndexInitialized();
      const p2 = ensureInvertedIndexInitialized();
      expect(p1).toBe(p2);
      await p1;
      // Counts were only queried once — the second call short-circuited.
      expect(bookmarksCount).toHaveBeenCalledTimes(1);
      expect(indexCount).toHaveBeenCalledTimes(1);
    } finally {
      bookmarksCount.mockRestore();
      indexCount.mockRestore();
    }
  });

  it("no-ops on an empty corpus (bookmark count is zero)", async () => {
    const db = getDB();
    // Real counts: both empty.
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      await ensureInvertedIndexInitialized();
      expect(await db.searchIndex.count()).toBe(0);
      const backfilled = info.mock.calls.some((args) =>
        String(args[0] ?? "").includes("inverted index thin"),
      );
      expect(backfilled).toBe(false);
    } finally {
      info.mockRestore();
    }
  });
});
