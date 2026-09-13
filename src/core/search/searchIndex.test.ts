import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Bookmark } from "../../shared/types";
import { getDB, resetDBForTests, type SearchIndexRow } from "../storage/db";
import { buildInvertedIndex, fullReindex, removeFromIndex } from "./indexer";

beforeEach(async () => {
  const db = getDB();
  await db.bookmarks.clear();
  await db.searchIndex.clear();
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

function rowFor(
  rows: SearchIndexRow[],
  term: string,
  field: SearchIndexRow["field"],
): SearchIndexRow | undefined {
  return rows.find((r) => r.term === term && r.field === field);
}

describe("buildInvertedIndex", () => {
  it("returns an empty list for a bookmark with no indexable content", () => {
    const b = makeBookmark({ id: "01A", domain: "", originalUrl: "", canonicalUrl: "" });
    expect(buildInvertedIndex(b)).toEqual([]);
  });

  it("emits the correct per-field rows for a fixture bookmark", () => {
    const b = makeBookmark({
      id: "01FIXTURE",
      title: "Diffusion Models for Image Generation",
      note: "must read soon — diffusion diffusion",
      tags: ["AI", "Paper", "generative-art"],
      domain: "arxiv.org",
      originalUrl: "https://arxiv.org/abs/2006.11239",
      canonicalUrl: "https://arxiv.org/abs/2006.11239",
    });

    const rows = buildInvertedIndex(b);

    // Every row is stamped with the source bookmarkId.
    for (const r of rows) expect(r.bookmarkId).toBe("01FIXTURE");

    // Title contributions with termFreq=1.
    expect(rowFor(rows, "diffusion", "title")).toEqual({
      term: "diffusion",
      bookmarkId: "01FIXTURE",
      field: "title",
      termFreq: 1,
    });
    expect(rowFor(rows, "models", "title")).toMatchObject({ field: "title", termFreq: 1 });
    expect(rowFor(rows, "for", "title")).toMatchObject({ field: "title", termFreq: 1 });
    expect(rowFor(rows, "image", "title")).toMatchObject({ field: "title", termFreq: 1 });
    expect(rowFor(rows, "generation", "title")).toMatchObject({ field: "title", termFreq: 1 });

    // Note contributions: "diffusion" appears twice → termFreq=2. "read"
    // and "soon" appear once. Single-letter "—" plus min-length-2 rule
    // drops nothing here.
    expect(rowFor(rows, "diffusion", "note")).toMatchObject({ field: "note", termFreq: 2 });
    expect(rowFor(rows, "must", "note")).toMatchObject({ field: "note", termFreq: 1 });
    expect(rowFor(rows, "read", "note")).toMatchObject({ field: "note", termFreq: 1 });
    expect(rowFor(rows, "soon", "note")).toMatchObject({ field: "note", termFreq: 1 });

    // Tag rows use the lowercased canonical tag as a single token — no
    // sub-tokenisation, so `generative-art` stays intact.
    expect(rowFor(rows, "ai", "tag")).toMatchObject({ field: "tag", termFreq: 1 });
    expect(rowFor(rows, "paper", "tag")).toMatchObject({ field: "tag", termFreq: 1 });
    expect(rowFor(rows, "generative-art", "tag")).toMatchObject({
      field: "tag",
      termFreq: 1,
    });
    // …and does NOT split the hyphenated tag.
    expect(rowFor(rows, "generative", "tag")).toBeUndefined();
    expect(rowFor(rows, "art", "tag")).toBeUndefined();

    // Domain rows include the full host and every label ≥2 chars.
    expect(rowFor(rows, "arxiv.org", "domain")).toMatchObject({ field: "domain", termFreq: 1 });
    expect(rowFor(rows, "arxiv", "domain")).toMatchObject({ field: "domain", termFreq: 1 });
    expect(rowFor(rows, "org", "domain")).toMatchObject({ field: "domain", termFreq: 1 });

    // URL rows include host labels plus path-segment tokens (pure-digit
    // path segments like "2006.11239" tokenise to nothing under the
    // \p{L}+\p{N}* rule; "abs" survives).
    expect(rowFor(rows, "arxiv.org", "url")).toMatchObject({ field: "url", termFreq: 1 });
    expect(rowFor(rows, "abs", "url")).toMatchObject({ field: "url", termFreq: 1 });
  });

  it("aggregates termFreq per (term, field) but keeps fields distinct", () => {
    const b = makeBookmark({
      id: "01A",
      title: "foo foo bar",
      note: "foo baz",
    });
    const rows = buildInvertedIndex(b);
    const fooTitle = rowFor(rows, "foo", "title");
    const fooNote = rowFor(rows, "foo", "note");
    expect(fooTitle?.termFreq).toBe(2);
    expect(fooNote?.termFreq).toBe(1);
  });

  it("skips single-letter tokens (min length 2)", () => {
    const b = makeBookmark({ id: "01A", title: "a big X y zz" });
    const rows = buildInvertedIndex(b);
    const terms = rows
      .filter((r) => r.field === "title")
      .map((r) => r.term)
      .sort();
    expect(terms).toEqual(["big", "zz"]);
  });

  it("handles Unicode content (CJK title + emoji note)", () => {
    const b = makeBookmark({
      id: "01U",
      title: "机器学习 模型",
      note: "🚀 launch soon",
    });
    const rows = buildInvertedIndex(b);
    expect(rowFor(rows, "机器学习", "title")).toBeDefined();
    expect(rowFor(rows, "模型", "title")).toBeDefined();
    expect(rowFor(rows, "launch", "note")).toBeDefined();
    expect(rowFor(rows, "soon", "note")).toBeDefined();
    // Emoji contributes no row.
    for (const r of rows) expect(r.term).not.toContain("🚀");
  });
});

describe("removeFromIndex", () => {
  it("deletes only the target bookmark's rows", async () => {
    const db = getDB();
    const b1 = makeBookmark({ id: "01A", title: "alpha beta gamma", domain: "a.example" });
    const b2 = makeBookmark({ id: "01B", title: "alpha delta", domain: "b.example" });

    await db.searchIndex.bulkPut(buildInvertedIndex(b1));
    await db.searchIndex.bulkPut(buildInvertedIndex(b2));
    const before = await db.searchIndex.count();
    expect(before).toBeGreaterThan(0);

    await removeFromIndex("01A");

    const remaining = await db.searchIndex.toArray();
    for (const r of remaining) expect(r.bookmarkId).toBe("01B");
    // b2's contribution must survive intact.
    const alphaRows = remaining.filter((r) => r.term === "alpha");
    expect(alphaRows.length).toBe(1);
    expect(alphaRows[0].bookmarkId).toBe("01B");
    // b1-only term is gone.
    expect(remaining.some((r) => r.term === "beta")).toBe(false);
  });

  it("is a no-op on an unknown / empty id", async () => {
    await expect(removeFromIndex("does-not-exist")).resolves.toBeUndefined();
    await expect(removeFromIndex("")).resolves.toBeUndefined();
  });
});

describe("fullReindex", () => {
  it("returns indexed=0 and fires progress(0,0) on an empty corpus", async () => {
    const events: Array<[number, number]> = [];
    const result = await fullReindex((done, total) => events.push([done, total]));
    expect(result).toEqual({ indexed: 0 });
    expect(events).toEqual([[0, 0]]);
  });

  it("rebuilds the store from bookmarks and reports progress in 500-row chunks", async () => {
    const db = getDB();
    const N = 1200;
    const bookmarks: Bookmark[] = [];
    for (let i = 0; i < N; i++) {
      bookmarks.push(
        makeBookmark({
          id: `bm-${i}`,
          canonicalUrl: `https://example.com/${i}`,
          originalUrl: `https://example.com/${i}`,
          title: `alpha ${i % 2 === 0 ? "even" : "odd"}`,
          domain: "example.com",
        }),
      );
    }
    await db.bookmarks.bulkPut(bookmarks);

    // Seed a stale row that must be cleared on reindex.
    await db.searchIndex.put({
      term: "ghost",
      bookmarkId: "missing",
      field: "title",
      termFreq: 1,
    });

    const events: Array<[number, number]> = [];
    const result = await fullReindex((done, total) => events.push([done, total]));
    expect(result).toEqual({ indexed: N });

    // Progress fired once per 500-row chunk: 500, 1000, 1200.
    expect(events).toEqual([
      [500, N],
      [1000, N],
      [N, N],
    ]);

    // Stale row cleared.
    const ghost = await db.searchIndex.where("bookmarkId").equals("missing").toArray();
    expect(ghost).toEqual([]);

    // Every bookmark contributes at least one title row for "alpha".
    const alphaCount = await db.searchIndex.where("term").equals("alpha").count();
    expect(alphaCount).toBe(N);
  });
});
