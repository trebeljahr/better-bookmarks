import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listBookmarks } from "../storage/bookmarks";
import { getDB, resetDBForTests } from "../storage/db";
import { migrateLegacyStore } from "./legacyToV1";

type StoredEntry = Record<string, unknown>;

function fakeChromeStorage(initial: StoredEntry) {
  const store: StoredEntry = { ...initial };
  const api = {
    storage: {
      local: {
        get: vi.fn(async (keys: string | string[] | null) => {
          if (keys === null) return { ...store };
          if (typeof keys === "string") {
            return keys in store ? { [keys]: store[keys] } : {};
          }
          const out: StoredEntry = {};
          for (const k of keys) {
            if (k in store) out[k] = store[k];
          }
          return out;
        }),
        set: vi.fn(async (entries: StoredEntry) => {
          Object.assign(store, entries);
        }),
        remove: vi.fn(async (keys: string | string[]) => {
          const list = Array.isArray(keys) ? keys : [keys];
          for (const k of list) delete store[k];
        }),
      },
    },
  };
  return { api, store };
}

beforeEach(async () => {
  await getDB().bookmarks.clear();
});

afterEach(() => {
  resetDBForTests();
  // biome-ignore lint/suspicious/noExplicitAny: test cleanup
  delete (globalThis as any).chrome;
});

describe("migrateLegacyStore", () => {
  it("migrates legacy bookmarks into Dexie", async () => {
    const { api } = fakeChromeStorage({
      "https://example.com/a?utm_source=foo": {
        url: "https://example.com/a?utm_source=foo",
        description: "Page A",
        rating: 7,
        necessaryTime: 5,
        timestamp: 1700000000000,
        tags: ["ai", "Read"],
      },
      "https://example.com/b": {
        url: "https://example.com/b",
        description: "Page B",
        rating: 5,
        necessaryTime: 0,
        timestamp: 1700000001000,
        tags: [],
      },
    });
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    (globalThis as any).chrome = api;

    const report = await migrateLegacyStore();
    expect(report.alreadyRan).toBe(false);
    expect(report.legacyCount).toBe(2);
    expect(report.imported).toBe(2);
    expect(report.merged).toBe(0);

    const all = await listBookmarks();
    expect(all).toHaveLength(2);
    const a = all.find((b) => b.canonicalUrl === "https://example.com/a");
    expect(a?.title).toBe("Page A");
    expect(a?.rating).toBe(7);
    expect(a?.tags).toEqual(["ai", "Read"]);
    expect(a?.capturedFrom).toBe("chrome-import");
  });

  it("merges duplicates after canonicalization", async () => {
    const { api } = fakeChromeStorage({
      "https://example.com/p?utm_source=twitter": {
        url: "https://example.com/p?utm_source=twitter",
        description: "via twitter",
        rating: 6,
        necessaryTime: 10,
        timestamp: 1700000000000,
        tags: ["a"],
      },
      "https://example.com/p?utm_source=email": {
        url: "https://example.com/p?utm_source=email",
        description: "via email",
        rating: 9,
        necessaryTime: 3,
        timestamp: 1700000005000,
        tags: ["b"],
      },
    });
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    (globalThis as any).chrome = api;

    const report = await migrateLegacyStore();
    expect(report.imported).toBe(1);
    expect(report.merged).toBe(1);

    const [bookmark] = await listBookmarks();
    expect(bookmark.tags).toEqual(["a", "b"]);
    expect(bookmark.rating).toBe(9);
    expect(bookmark.createdAt).toBe(1700000000000);
  });

  it("skips if already ran", async () => {
    const { api } = fakeChromeStorage({
      __bb_legacy_migration__: { ranAt: 1 },
      "https://x.test/": {
        url: "https://x.test/",
        description: "x",
        rating: 5,
        necessaryTime: 0,
        timestamp: 1,
        tags: [],
      },
    });
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    (globalThis as any).chrome = api;

    const report = await migrateLegacyStore();
    expect(report.alreadyRan).toBe(true);
    expect(await listBookmarks()).toHaveLength(0);
  });

  it("counts rejected unparseable urls", async () => {
    const { api } = fakeChromeStorage({
      "chrome://settings": {
        url: "chrome://settings",
        description: "settings",
        rating: 5,
        necessaryTime: 0,
        timestamp: 1,
        tags: [],
      },
    });
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    (globalThis as any).chrome = api;

    const report = await migrateLegacyStore();
    expect(report.rejected).toBe(1);
    expect(report.imported).toBe(0);
    expect(await listBookmarks()).toHaveLength(0);
  });
});
