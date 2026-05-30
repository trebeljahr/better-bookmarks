import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Bookmark, CaptureSource, ContentType, ReadStatus } from "../../shared/types";
import { getDB, resetDBForTests } from "../storage/db";
import { indexBookmark } from "./indexer";
import { parseQuery } from "./query";
import { runQuery, search } from "./runner";

const DAY = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  const db = getDB();
  await db.bookmarks.clear();
  await db.postings.clear();
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
  for (const b of made) await indexBookmark(b);
  return made;
}

describe("runQuery — bare-term search", () => {
  it("returns nothing for an unknown term", async () => {
    await seed([{ id: "1", title: "hello" }]);
    const r = await runQuery(parseQuery("absent"));
    expect(r).toEqual([]);
  });

  it("matches a single term across fields", async () => {
    await seed([
      { id: "1", title: "Diffusion Models" },
      { id: "2", note: "diffusion is great" },
      { id: "3", title: "Transformers" },
    ]);
    const r = await runQuery(parseQuery("diffusion"));
    const ids = r.map((b) => b.id).sort();
    expect(ids).toEqual(["1", "2"]);
  });

  it("AND-intersects multiple bare terms", async () => {
    await seed([
      { id: "1", title: "react hooks" },
      { id: "2", title: "react components" },
      { id: "3", title: "vue hooks" },
    ]);
    const r = await runQuery(parseQuery("react hooks"));
    expect(r.map((b) => b.id)).toEqual(["1"]);
  });
});

describe("runQuery — filters", () => {
  it("tag filter narrows results", async () => {
    await seed([
      { id: "1", title: "react", tags: ["frontend"] },
      { id: "2", title: "react", tags: ["backend"] },
    ]);
    const r = await runQuery(parseQuery("react tag:frontend"));
    expect(r.map((b) => b.id)).toEqual(["1"]);
  });

  it("domain filter narrows results", async () => {
    await seed([
      { id: "1", title: "post", domain: "a.com" },
      { id: "2", title: "post", domain: "b.com" },
    ]);
    const r = await runQuery(parseQuery("post domain:b.com"));
    expect(r.map((b) => b.id)).toEqual(["2"]);
  });

  it("status filter narrows results", async () => {
    await seed([
      { id: "1", title: "post", status: "unread" },
      { id: "2", title: "post", status: "read" },
    ]);
    const r = await runQuery(parseQuery("post is:read"));
    expect(r.map((b) => b.id)).toEqual(["2"]);
  });

  it("rating filter excludes lower-rated", async () => {
    await seed([
      { id: "1", title: "post", rating: 3 },
      { id: "2", title: "post", rating: 8 },
      { id: "3", title: "post", rating: null },
    ]);
    const r = await runQuery(parseQuery("post rating:>=7"));
    expect(r.map((b) => b.id)).toEqual(["2"]);
  });

  it("works with only filters (no bare terms)", async () => {
    await seed([
      { id: "1", title: "x", tags: ["a"], rating: 5 },
      { id: "2", title: "y", tags: ["b"], rating: 5 },
    ]);
    const r = await runQuery(parseQuery("tag:a"));
    expect(r.map((b) => b.id)).toEqual(["1"]);
  });

  it("excludeTags drops bookmarks carrying the tag", async () => {
    await seed([
      { id: "1", title: "x", tags: ["frontend"] },
      { id: "2", title: "y", tags: ["backend"] },
      { id: "3", title: "z", tags: ["frontend", "backend"] },
    ]);
    const r = await runQuery(parseQuery("-tag:frontend"));
    expect(r.map((b) => b.id).sort()).toEqual(["2"]);
  });

  it("untagged keeps only bookmarks with empty tags", async () => {
    await seed([
      { id: "1", title: "x", tags: ["frontend"] },
      { id: "2", title: "y", tags: [] },
      { id: "3", title: "z", tags: ["backend"] },
    ]);
    const r = await runQuery(parseQuery("is:untagged"));
    expect(r.map((b) => b.id)).toEqual(["2"]);
  });

  it("search() runs runQuery when only untagged is set", async () => {
    await seed([
      { id: "1", title: "x", tags: ["a"] },
      { id: "2", title: "y", tags: [] },
    ]);
    const r = await search("is:untagged");
    expect(r.map((b) => b.id)).toEqual(["2"]);
  });
});

describe("runQuery — ranking", () => {
  it("ranks higher-rated bookmarks above lower-rated", async () => {
    await seed([
      { id: "lo", title: "react guide", rating: 2 },
      { id: "hi", title: "react guide", rating: 9 },
    ]);
    const r = await runQuery(parseQuery("react"));
    expect(r[0].id).toBe("hi");
  });

  it("ranks recent bookmarks above stale ones (same rating)", async () => {
    const now = Date.now();
    await seed([
      { id: "old", title: "react guide", rating: 5, updatedAt: now - 365 * DAY },
      { id: "new", title: "react guide", rating: 5, updatedAt: now - 1 * DAY },
    ]);
    const r = await runQuery(parseQuery("react"), { now });
    expect(r[0].id).toBe("new");
  });

  it("tag-matched term outranks title-matched term", async () => {
    // term "ai" weight: tag=4, title=3.
    await seed([
      { id: "title-only", title: "ai notes", tags: ["misc"] },
      { id: "tag-only", title: "general notes", tags: ["AI"] },
    ]);
    const r = await runQuery(parseQuery("ai"));
    expect(r[0].id).toBe("tag-only");
  });

  it("respects the limit option", async () => {
    const rows: Seed[] = [];
    for (let i = 0; i < 15; i++) rows.push({ id: `b${i}`, title: "common" });
    await seed(rows);
    const r = await runQuery(parseQuery("common"), { limit: 5 });
    expect(r).toHaveLength(5);
  });
});

describe("search — high-level entrypoint", () => {
  it("returns recent bookmarks for empty query", async () => {
    const now = Date.now();
    await seed([
      { id: "old", title: "old", updatedAt: now - 100 * DAY },
      { id: "new", title: "new", updatedAt: now - 1 * DAY },
    ]);
    const r = await search("");
    expect(r[0].id).toBe("new");
    expect(r[1].id).toBe("old");
  });

  it("handles a 10-bookmark realistic corpus", async () => {
    const now = Date.now();
    const rows: Seed[] = [
      {
        id: "a01",
        title: "Attention is All You Need",
        tags: ["AI", "paper"],
        rating: 10,
        domain: "arxiv.org",
        updatedAt: now - 30 * DAY,
      },
      {
        id: "a02",
        title: "GPT-3 paper",
        tags: ["AI", "paper"],
        rating: 9,
        domain: "arxiv.org",
        updatedAt: now - 90 * DAY,
      },
      {
        id: "a03",
        title: "React Server Components",
        tags: ["frontend", "react"],
        rating: 7,
        domain: "react.dev",
        updatedAt: now - 2 * DAY,
      },
      {
        id: "a04",
        title: "Vue Composition API",
        tags: ["frontend", "vue"],
        rating: 6,
        domain: "vuejs.org",
        updatedAt: now - 5 * DAY,
      },
      {
        id: "a05",
        title: "Diffusion Models",
        tags: ["AI", "paper"],
        rating: 8,
        domain: "arxiv.org",
        updatedAt: now - 10 * DAY,
      },
      {
        id: "a06",
        title: "Postgres tuning",
        tags: ["backend", "db"],
        rating: 7,
        domain: "postgresql.org",
        updatedAt: now - 60 * DAY,
      },
      {
        id: "a07",
        title: "Rust async",
        tags: ["backend", "rust"],
        rating: 8,
        domain: "rust-lang.org",
        updatedAt: now - 15 * DAY,
      },
      {
        id: "a08",
        title: "TypeScript narrowing",
        tags: ["frontend", "typescript"],
        rating: 9,
        domain: "typescriptlang.org",
        updatedAt: now - 1 * DAY,
      },
      {
        id: "a09",
        title: "Diffusion fundamentals",
        tags: ["AI"],
        rating: 4,
        domain: "openai.com",
        updatedAt: now - 200 * DAY,
      },
      {
        id: "a10",
        title: "old AI overview",
        tags: ["AI"],
        rating: null,
        status: "archived",
        domain: "example.com",
        updatedAt: now - 400 * DAY,
      },
    ];
    await seed(rows);

    // Find AI-tagged papers, must be unread/read (not archived), rating >= 8.
    const r = await search("tag:AI tag:paper rating:>=8", { now });
    const ids = r.map((b) => b.id);
    expect(ids).toContain("a01");
    expect(ids).toContain("a02");
    expect(ids).toContain("a05");
    expect(ids).not.toContain("a09");

    // Bare-word search.
    const r2 = await search("diffusion", { now });
    const ids2 = r2.map((b) => b.id);
    expect(ids2).toContain("a05");
    expect(ids2).toContain("a09");
    // a05 should rank above a09 (better rating, newer).
    expect(ids2.indexOf("a05")).toBeLessThan(ids2.indexOf("a09"));

    // Domain filter.
    const r3 = await search("domain:arxiv.org", { now });
    expect(r3.every((b) => b.domain === "arxiv.org")).toBe(true);
    expect(r3.length).toBeGreaterThanOrEqual(3);
  });
});
