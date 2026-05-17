import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteBookmark, updateBookmark, upsertBookmark } from "../storage/bookmarks";
import { getDB, resetDBForTests } from "../storage/db";
import { ensureSearchIndexInitialized, resetSearchWiringForTests, wireSearchIndexer } from "./wire";

beforeEach(async () => {
  resetSearchWiringForTests();
  const db = getDB();
  await db.bookmarks.clear();
  await db.postings.clear();
});

afterEach(() => {
  resetDBForTests();
  resetSearchWiringForTests();
});

async function waitMicrotasks(times = 4): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

describe("wireSearchIndexer", () => {
  it("indexes postings when a bookmark is created", async () => {
    wireSearchIndexer();
    const r = await upsertBookmark({
      rawUrl: "https://example.com/a",
      title: "hello world",
    });
    expect(r.ok).toBe(true);
    await waitMicrotasks();
    const db = getDB();
    const postings = await db.postings.where("term").equals("hello").toArray();
    expect(postings.length).toBeGreaterThan(0);
  });

  it("reindexes when a bookmark is updated", async () => {
    wireSearchIndexer();
    const initial = await upsertBookmark({
      rawUrl: "https://example.com/b",
      title: "initial",
    });
    if (!initial.ok) throw new Error("setup");
    await waitMicrotasks();
    await updateBookmark(initial.bookmark.id, { title: "changed", description: "" });
    await waitMicrotasks();
    const db = getDB();
    const initialPostings = await db.postings.where("term").equals("initial").toArray();
    const changedPostings = await db.postings.where("term").equals("changed").toArray();
    expect(initialPostings.length).toBe(0);
    expect(changedPostings.length).toBeGreaterThan(0);
  });

  it("removes postings when a bookmark is deleted", async () => {
    wireSearchIndexer();
    const r = await upsertBookmark({ rawUrl: "https://example.com/c", title: "gone" });
    if (!r.ok) throw new Error("setup");
    await waitMicrotasks();
    await deleteBookmark(r.bookmark.id);
    await waitMicrotasks();
    const db = getDB();
    const postings = await db.postings.where("term").equals("gone").toArray();
    expect(postings.length).toBe(0);
  });

  it("is idempotent across multiple calls in one context", async () => {
    wireSearchIndexer();
    wireSearchIndexer();
    wireSearchIndexer();
    const r = await upsertBookmark({ rawUrl: "https://example.com/d", title: "once" });
    expect(r.ok).toBe(true);
    await waitMicrotasks();
    const db = getDB();
    // Even though wire is called 3x, hooks should each fire once -> single posting
    // for the `once` term in this bookmark.
    const postings = await db.postings.where("term").equals("once").toArray();
    expect(postings.length).toBe(1);
  });
});

describe("ensureSearchIndexInitialized", () => {
  it("backfills postings when bookmarks exist but index is empty", async () => {
    const r1 = await upsertBookmark({ rawUrl: "https://example.com/x", title: "alpha" });
    const r2 = await upsertBookmark({ rawUrl: "https://example.com/y", title: "beta" });
    expect(r1.ok && r2.ok).toBe(true);
    const db = getDB();
    await db.postings.clear();
    expect(await db.postings.count()).toBe(0);
    await ensureSearchIndexInitialized();
    const alpha = await db.postings.where("term").equals("alpha").toArray();
    const beta = await db.postings.where("term").equals("beta").toArray();
    expect(alpha.length).toBeGreaterThan(0);
    expect(beta.length).toBeGreaterThan(0);
  });

  it("no-ops when index already has postings", async () => {
    const r = await upsertBookmark({ rawUrl: "https://example.com/z", title: "kept" });
    expect(r.ok).toBe(true);
    wireSearchIndexer();
    const r2 = await upsertBookmark({ rawUrl: "https://example.com/w", title: "fresh" });
    expect(r2.ok).toBe(true);
    await waitMicrotasks();
    const db = getDB();
    const beforeCount = await db.postings.count();
    expect(beforeCount).toBeGreaterThan(0);
    await ensureSearchIndexInitialized();
    const afterCount = await db.postings.count();
    expect(afterCount).toBe(beforeCount);
  });
});
