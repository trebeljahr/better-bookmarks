import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Bookmark, CaptureSource, ContentType, ReadStatus } from "../../shared/types";
import { getDB, resetDBForTests } from "../storage/db";
import { buildInvertedIndex } from "./indexer";
import { rank, type RankWeights, search } from "./rank";

const DAY = 24 * 60 * 60 * 1000;

// Zero out three of the four factors so a single-factor assertion can
// prove that factor contributes without leakage from the others.
function only(factor: keyof RankWeights): RankWeights {
  return {
    recency: factor === "recency" ? 1 : 0,
    rating: factor === "rating" ? 1 : 0,
    tagMatch: factor === "tagMatch" ? 1 : 0,
    termFreq: factor === "termFreq" ? 1 : 0,
  };
}

beforeEach(async () => {
  const db = getDB();
  await db.bookmarks.clear();
  await db.searchIndex.clear();
});

afterEach(() => {
  resetDBForTests();
});

type Seed = Partial<Bookmark> & { id: string };

async function seed(rows: Seed[]): Promise<Bookmark[]> {
  const now = Date.now();
  const made: Bookmark[] = rows.map((r, i) => ({
    id: r.id,
    canonicalUrl: r.canonicalUrl ?? `https://example.com/${i}`,
    originalUrl: r.originalUrl ?? `https://example.com/${i}`,
    domain: r.domain ?? "example.com",
    title: r.title ?? "",
    description: r.description ?? "",
    note: r.note ?? "",
    tags: r.tags ?? [],
    rating: r.rating ?? null,
    necessaryTime: r.necessaryTime ?? null,
    contentType: (r.contentType ?? "unknown") as ContentType,
    language: r.language ?? null,
    status: (r.status ?? "unread") as ReadStatus,
    readAt: r.readAt ?? null,
    createdAt: r.createdAt ?? now,
    updatedAt: r.updatedAt ?? now,
    capturedFrom: (r.capturedFrom ?? "manual") as CaptureSource,
  }));
  const db = getDB();
  await db.bookmarks.bulkPut(made);
  const rowsToInsert = made.flatMap((b) => buildInvertedIndex(b));
  if (rowsToInsert.length > 0) await db.searchIndex.bulkPut(rowsToInsert);
  return made;
}

describe("rank — each factor contributes", () => {
  it("recency alone orders newer above older", async () => {
    const now = Date.now();
    await seed([
      { id: "old", title: "post about things", updatedAt: now - 200 * DAY },
      { id: "new", title: "post about things", updatedAt: now - 1 * DAY },
    ]);
    const r = await search("post", { now, weights: only("recency") });
    expect(r.map((x) => x.bookmark.id)).toEqual(["new", "old"]);
    // Both must record the factor in the breakdown.
    for (const item of r) expect(item.factors.recency).toBeGreaterThan(0);
    expect(r[0].factors.recency).toBeGreaterThan(r[1].factors.recency);
  });

  it("rating alone orders higher-rated above lower-rated", async () => {
    const now = Date.now();
    await seed([
      { id: "lo", title: "post", rating: 2, updatedAt: now },
      { id: "hi", title: "post", rating: 9, updatedAt: now },
    ]);
    const r = await search("post", { now, weights: only("rating") });
    expect(r.map((x) => x.bookmark.id)).toEqual(["hi", "lo"]);
    expect(r[0].factors.rating).toBeCloseTo(0.9, 5);
    expect(r[1].factors.rating).toBeCloseTo(0.2, 5);
  });

  it("tagMatch is 1 when a tag: filter is present, 0 otherwise", async () => {
    const now = Date.now();
    await seed([
      { id: "tagged", title: "post", tags: ["frontend"], updatedAt: now },
      { id: "bare", title: "post", tags: [], updatedAt: now },
    ]);

    // Without tag: filter → tagMatch=0 for both (no query tags).
    const noTag = await search("post", { now, weights: only("tagMatch") });
    for (const item of noTag) {
      expect(item.factors.tagMatch).toBe(0);
      expect(item.score).toBe(0);
    }

    // With tag:frontend → filter drops "bare", "tagged" gets tagMatch=1.
    const withTag = await search("post tag:frontend", { now, weights: only("tagMatch") });
    expect(withTag.map((x) => x.bookmark.id)).toEqual(["tagged"]);
    expect(withTag[0].factors.tagMatch).toBe(1);
    expect(withTag[0].score).toBe(1);
  });

  it("termFreq alone orders bookmarks by BM25-lite frequency", async () => {
    const now = Date.now();
    await seed([
      { id: "few", title: "diffusion once", updatedAt: now },
      { id: "many", title: "diffusion diffusion diffusion diffusion", updatedAt: now },
    ]);
    const r = await search("diffusion", { now, weights: only("termFreq") });
    expect(r.map((x) => x.bookmark.id)).toEqual(["many", "few"]);
    expect(r[0].factors.termFreq).toBeGreaterThan(r[1].factors.termFreq);
    // Bounded above by ~1 after normalisation.
    for (const item of r) expect(item.factors.termFreq).toBeLessThanOrEqual(1.001);
  });
});

describe("rank — combined ordering with default weights", () => {
  it("weighs recency + rating + termFreq together so the best-overall wins", async () => {
    const now = Date.now();
    await seed([
      // Recent, well-rated, mentions term twice → should win.
      {
        id: "best",
        title: "react react patterns",
        rating: 9,
        updatedAt: now - 1 * DAY,
      },
      // Stale but well-rated with a single title mention.
      {
        id: "stale",
        title: "react hooks",
        rating: 9,
        updatedAt: now - 400 * DAY,
      },
      // Recent, low rating, single mention.
      {
        id: "meh",
        title: "react basics",
        rating: 2,
        updatedAt: now - 2 * DAY,
      },
    ]);
    const r = await search("react", { now });
    const ids = r.map((x) => x.bookmark.id);
    expect(ids[0]).toBe("best");
    // "stale" should sink because recency is a bigger weight than a
    // rating bump can fully compensate for at 400-day distance.
    expect(ids.indexOf("meh")).toBeLessThan(ids.indexOf("stale"));
    // Scores are strictly decreasing (assuming unique tiebreaks).
    for (let i = 1; i < r.length; i++) {
      expect(r[i - 1].score).toBeGreaterThanOrEqual(r[i].score);
    }
  });

  it("empty query returns most-recent bookmarks (fallback path)", async () => {
    const now = Date.now();
    await seed([
      { id: "old", title: "old", updatedAt: now - 100 * DAY },
      { id: "new", title: "new", updatedAt: now - 1 * DAY },
    ]);
    const r = await search("", { now });
    expect(r.map((x) => x.bookmark.id)).toEqual(["new", "old"]);
  });
});

describe("rank — filters actually filter", () => {
  it("tag: keeps only bookmarks carrying every listed tag", async () => {
    await seed([
      { id: "1", title: "react", tags: ["frontend"] },
      { id: "2", title: "react", tags: ["backend"] },
    ]);
    const r = await search("react tag:frontend");
    expect(r.map((x) => x.bookmark.id)).toEqual(["1"]);
  });

  it("domain: keeps only exact-host matches", async () => {
    await seed([
      { id: "1", title: "post", domain: "a.com" },
      { id: "2", title: "post", domain: "b.com" },
    ]);
    const r = await search("post domain:b.com");
    expect(r.map((x) => x.bookmark.id)).toEqual(["2"]);
  });

  it("is:unread drops bookmarks in other statuses", async () => {
    await seed([
      { id: "u", title: "post", status: "unread" },
      { id: "r", title: "post", status: "read" },
      { id: "a", title: "post", status: "archived" },
    ]);
    const r = await search("post is:unread");
    expect(r.map((x) => x.bookmark.id)).toEqual(["u"]);
  });

  it("rating:>=N excludes lower ratings, keeps ties, and drops null", async () => {
    await seed([
      { id: "low", title: "post", rating: 3 },
      { id: "eq", title: "post", rating: 7 },
      { id: "hi", title: "post", rating: 9 },
      { id: "nil", title: "post", rating: null },
    ]);
    const r = await search("post rating:>=7");
    const ids = r.map((x) => x.bookmark.id).sort();
    expect(ids).toEqual(["eq", "hi"]);
  });
});

describe("rank — plumbing", () => {
  it("returns nothing for an unknown term", async () => {
    await seed([{ id: "1", title: "hello world" }]);
    const r = await search("absent");
    expect(r).toEqual([]);
  });

  it("AND-intersects multiple bare terms", async () => {
    await seed([
      { id: "1", title: "react hooks" },
      { id: "2", title: "react components" },
      { id: "3", title: "vue hooks" },
    ]);
    const r = await search("react hooks");
    expect(r.map((x) => x.bookmark.id)).toEqual(["1"]);
  });

  it("respects the limit option", async () => {
    const rows: Seed[] = [];
    for (let i = 0; i < 15; i++) rows.push({ id: `b${i}`, title: "common" });
    await seed(rows);
    const r = await rank(
      // Explicitly construct the same shape parseQuery would return.
      // parseQuery lowercases bare terms, so use lowercase here too.
      (await import("./query")).parseQuery("common"),
      { limit: 5 },
    );
    expect(r).toHaveLength(5);
  });
});
