import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Bookmark } from "../../shared/types";
import { upsertBookmark } from "../storage/bookmarks";
import { getDB, resetDBForTests } from "../storage/db";
import {
  FIELD_WEIGHTS,
  getPostingsForTerm,
  indexBookmark,
  reindexAll,
  removeBookmark,
} from "./indexer";

beforeEach(async () => {
  const db = getDB();
  await db.bookmarks.clear();
  await db.postings.clear();
});

afterEach(() => {
  resetDBForTests();
});

function makeBookmark(overrides: Partial<Bookmark> = {}): Bookmark {
  const now = Date.now();
  return {
    id: "01ABC",
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

describe("indexBookmark", () => {
  it("writes postings for title, description, note, tags, domain", async () => {
    const b = makeBookmark({
      id: "01A",
      title: "Diffusion Models",
      description: "Generative neural networks",
      note: "must read soon",
      tags: ["AI", "Paper"],
      domain: "arxiv.org",
    });
    await indexBookmark(b);
    const all = await getDB().postings.toArray();
    const terms = new Set(all.map((p) => p.term));
    expect(terms.has("diffusion")).toBe(true);
    expect(terms.has("models")).toBe(true);
    expect(terms.has("generative")).toBe(true);
    expect(terms.has("read")).toBe(true);
    expect(terms.has("ai")).toBe(true);
    expect(terms.has("paper")).toBe(true);
    expect(terms.has("arxiv.org")).toBe(true);
    expect(terms.has("arxiv")).toBe(true);
  });

  it("uses field weights as configured", async () => {
    const b = makeBookmark({
      id: "01A",
      title: "Foo",
      description: "Foo",
      domain: "foo.com",
      tags: ["foo"],
    });
    await indexBookmark(b);
    const fooPostings = await getPostingsForTerm("foo");
    // "foo" appears in title, description, domain (as label), and tag.
    // The tag weight (4) should win.
    expect(fooPostings).toHaveLength(1);
    expect(fooPostings[0].weight).toBe(FIELD_WEIGHTS.tag);
    expect(fooPostings[0].field).toBe("tag");
  });

  it("uses title weight when no higher-weighted field has the term", async () => {
    const b = makeBookmark({ id: "01A", title: "Unique" });
    await indexBookmark(b);
    const postings = await getPostingsForTerm("unique");
    expect(postings).toHaveLength(1);
    expect(postings[0].field).toBe("title");
    expect(postings[0].weight).toBe(FIELD_WEIGHTS.title);
  });

  it("is idempotent — re-indexing replaces postings", async () => {
    const b = makeBookmark({ id: "01A", title: "First Title" });
    await indexBookmark(b);
    const b2 = { ...b, title: "Second Title" };
    await indexBookmark(b2);
    const first = await getPostingsForTerm("first");
    const second = await getPostingsForTerm("second");
    expect(first).toHaveLength(0);
    expect(second).toHaveLength(1);
  });

  it("writes no postings for a fully empty bookmark", async () => {
    const b = makeBookmark({ id: "01A", domain: "" });
    await indexBookmark(b);
    expect(await getDB().postings.count()).toBe(0);
  });
});

describe("removeBookmark", () => {
  it("deletes all postings for a bookmark", async () => {
    const b1 = makeBookmark({ id: "01A", title: "alpha beta gamma", domain: "a.com" });
    const b2 = makeBookmark({ id: "01B", title: "alpha delta", domain: "b.com" });
    await indexBookmark(b1);
    await indexBookmark(b2);
    await removeBookmark("01A");
    const alpha = await getPostingsForTerm("alpha");
    expect(alpha).toHaveLength(1);
    expect(alpha[0].bookmarkId).toBe("01B");
    const beta = await getPostingsForTerm("beta");
    expect(beta).toHaveLength(0);
  });

  it("is a no-op on an unknown id", async () => {
    await expect(removeBookmark("nope")).resolves.toBeUndefined();
  });
});

describe("reindexAll", () => {
  it("rebuilds the index from listBookmarks", async () => {
    await upsertBookmark({ rawUrl: "https://example.com/a", title: "alpha" });
    await upsertBookmark({ rawUrl: "https://example.com/b", title: "beta" });
    const { indexed } = await reindexAll();
    expect(indexed).toBe(2);
    const alpha = await getPostingsForTerm("alpha");
    const beta = await getPostingsForTerm("beta");
    expect(alpha).toHaveLength(1);
    expect(beta).toHaveLength(1);
  });

  it("clears stale postings", async () => {
    // Index a phantom posting that no longer corresponds to a bookmark.
    await getDB().postings.put({
      term: "ghost",
      bookmarkId: "missing",
      field: "title",
      weight: 3,
    });
    await upsertBookmark({ rawUrl: "https://example.com/a", title: "alpha" });
    await reindexAll();
    const ghost = await getPostingsForTerm("ghost");
    expect(ghost).toHaveLength(0);
  });

  it("returns indexed=0 on empty store", async () => {
    const r = await reindexAll();
    expect(r).toEqual({ indexed: 0 });
  });
});
