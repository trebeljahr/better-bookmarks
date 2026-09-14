import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEdge, listAllEdges } from "../edges/crud";
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
import { getPageSnapshot, putPageSnapshot } from "./pageSnapshots";

beforeEach(async () => {
  const db = getDB();
  await db.bookmarks.clear();
  await db.pageSnapshots.clear();
  await db.edges.clear();
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

  it("cascades to the page snapshot for the deleted bookmark", async () => {
    const initial = await upsertBookmark({ rawUrl: "https://example.com/snap-cascade" });
    if (!initial.ok) throw new Error("setup failed");
    await putPageSnapshot({
      bookmarkId: initial.bookmark.id,
      capturedAt: 1,
      text: "hello",
      byteLength: 5,
    });
    expect(await getPageSnapshot(initial.bookmark.id)).toBeDefined();
    await deleteBookmark(initial.bookmark.id);
    expect(await getPageSnapshot(initial.bookmark.id)).toBeUndefined();
  });

  it("cascades to every edge that references the deleted bookmark on either end", async () => {
    const a = await upsertBookmark({ rawUrl: "https://example.com/edge-a" });
    const b = await upsertBookmark({ rawUrl: "https://example.com/edge-b" });
    const c = await upsertBookmark({ rawUrl: "https://example.com/edge-c" });
    if (!a.ok || !b.ok || !c.ok) throw new Error("setup failed");
    await createEdge({ fromId: a.bookmark.id, toId: b.bookmark.id, type: "related" });
    await createEdge({ fromId: c.bookmark.id, toId: a.bookmark.id, type: "source" });
    const survivor = await createEdge({
      fromId: b.bookmark.id,
      toId: c.bookmark.id,
      type: "related",
    });
    expect(await listAllEdges()).toHaveLength(3);
    await deleteBookmark(a.bookmark.id);
    const remaining = await listAllEdges();
    expect(remaining.map((e) => e.id)).toEqual([survivor.id]);
  });

  it("leaves other bookmarks' snapshots alone", async () => {
    const a = await upsertBookmark({ rawUrl: "https://example.com/keep-1" });
    const b = await upsertBookmark({ rawUrl: "https://example.com/keep-2" });
    if (!a.ok || !b.ok) throw new Error("setup failed");
    await putPageSnapshot({
      bookmarkId: a.bookmark.id,
      capturedAt: 1,
      text: "a",
      byteLength: 1,
    });
    await putPageSnapshot({
      bookmarkId: b.bookmark.id,
      capturedAt: 2,
      text: "b",
      byteLength: 1,
    });
    await deleteBookmark(a.bookmark.id);
    expect(await getPageSnapshot(a.bookmark.id)).toBeUndefined();
    expect(await getPageSnapshot(b.bookmark.id)).toBeDefined();
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
