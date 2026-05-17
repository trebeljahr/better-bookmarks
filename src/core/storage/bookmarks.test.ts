import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  countBookmarks,
  dedupTags,
  deleteBookmark,
  getBookmarkByCanonicalUrl,
  listBookmarks,
  updateBookmark,
  upsertBookmark,
} from "./bookmarks";
import { getDB, resetDBForTests } from "./db";

beforeEach(async () => {
  await getDB().bookmarks.clear();
});

afterEach(() => {
  resetDBForTests();
});

describe("upsertBookmark", () => {
  it("creates a bookmark with canonicalized url", async () => {
    const result = await upsertBookmark({
      rawUrl: "https://example.com/?utm_source=foo&a=1",
      title: "hello",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.created).toBe(true);
    expect(result.bookmark.canonicalUrl).toBe("https://example.com/?a=1");
    expect(result.bookmark.domain).toBe("example.com");
    expect(result.bookmark.title).toBe("hello");
  });

  it("dedupes by canonical url and merges tags", async () => {
    await upsertBookmark({
      rawUrl: "https://example.com/article?utm_source=twitter",
      title: "first",
      tags: ["a", "b"],
    });
    const r2 = await upsertBookmark({
      rawUrl: "https://example.com/article?utm_source=email",
      title: "second",
      tags: ["c", "b"],
    });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.created).toBe(false);
    expect(r2.bookmark.tags).toEqual(["a", "b", "c"]);
    expect(r2.bookmark.title).toBe("second");
    expect(await countBookmarks()).toBe(1);
  });

  it("rejects unbookmarkable schemes", async () => {
    const result = await upsertBookmark({ rawUrl: "chrome://settings" });
    expect(result.ok).toBe(false);
  });
});

describe("getBookmarkByCanonicalUrl", () => {
  it("retrieves by canonical key", async () => {
    await upsertBookmark({ rawUrl: "https://example.com/x" });
    const found = await getBookmarkByCanonicalUrl("https://example.com/x");
    expect(found?.canonicalUrl).toBe("https://example.com/x");
  });
});

describe("updateBookmark", () => {
  it("updates fields and bumps updatedAt", async () => {
    const initial = await upsertBookmark({ rawUrl: "https://example.com/y" });
    if (!initial.ok) throw new Error("setup failed");
    const before = initial.bookmark.updatedAt;
    await new Promise((r) => setTimeout(r, 2));
    const updated = await updateBookmark(initial.bookmark.id, { rating: 8 });
    expect(updated?.rating).toBe(8);
    expect(updated?.updatedAt).toBeGreaterThan(before);
  });

  it("dedupes tag list when patching tags", async () => {
    const initial = await upsertBookmark({ rawUrl: "https://example.com/z" });
    if (!initial.ok) throw new Error("setup failed");
    const updated = await updateBookmark(initial.bookmark.id, { tags: ["A", "a", "b"] });
    expect(updated?.tags).toEqual(["A", "b"]);
  });
});

describe("deleteBookmark", () => {
  it("removes the record", async () => {
    const initial = await upsertBookmark({ rawUrl: "https://example.com/del" });
    if (!initial.ok) throw new Error("setup failed");
    await deleteBookmark(initial.bookmark.id);
    expect(await listBookmarks()).toHaveLength(0);
  });
});

describe("dedupTags", () => {
  it("preserves first-seen case and sorts", () => {
    expect(dedupTags([" b ", "A", "a", "b", "c"])).toEqual(["A", "b", "c"]);
  });
  it("drops empty entries", () => {
    expect(dedupTags(["", "  ", "x"])).toEqual(["x"]);
  });
});
