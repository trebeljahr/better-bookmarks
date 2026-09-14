import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Bookmark } from "../../shared/types";
import { getDB, resetDBForTests } from "../storage/db";
import { createEdge, listAllEdges, listEdgesFor } from "./crud";
import { rejectEdgePair } from "./rejected";
import { materializeSuggestion, suggestEdgesFor } from "./suggest";

beforeEach(async () => {
  const db = getDB();
  await db.edges.clear();
  await db.bookmarks.clear();
  await db.rejectedEdgePairs.clear();
});

afterEach(() => {
  resetDBForTests();
});

let clock = 1700000000000;
function nextTs(): number {
  clock += 1000;
  return clock;
}

function makeBookmark(partial: Partial<Bookmark> & { id: string }): Bookmark {
  const ts = nextTs();
  return {
    id: partial.id,
    canonicalUrl: partial.canonicalUrl ?? `https://example.com/${partial.id}`,
    originalUrl: partial.originalUrl ?? `https://example.com/${partial.id}`,
    domain: partial.domain ?? "example.com",
    title: partial.title ?? `title-${partial.id}`,
    description: partial.description ?? "",
    note: partial.note ?? "",
    tags: partial.tags ?? [],
    rating: partial.rating ?? null,
    necessaryTime: partial.necessaryTime ?? null,
    contentType: partial.contentType ?? "unknown",
    language: partial.language ?? null,
    status: partial.status ?? "unread",
    readAt: partial.readAt ?? null,
    createdAt: partial.createdAt ?? ts,
    updatedAt: partial.updatedAt ?? ts,
    capturedFrom: partial.capturedFrom ?? "manual",
  };
}

async function seed(bookmarks: Bookmark[]): Promise<void> {
  await getDB().bookmarks.bulkPut(bookmarks);
}

describe("suggestEdgesFor", () => {
  it("triggers when same domain AND >=1 shared tag", async () => {
    await seed([
      makeBookmark({ id: "a", domain: "arxiv.org", tags: ["AI"] }),
      makeBookmark({ id: "b", domain: "arxiv.org", tags: ["AI"] }),
    ]);
    const suggestions = await suggestEdgesFor("a");
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].toId).toBe("b");
    expect(suggestions[0].strength).toBe(3); // 1 tag * 2 + 1 domain
    expect(suggestions[0].reason).toBe("same domain + shared tag: AI");
  });

  it("triggers when >=2 shared tags even on different domains", async () => {
    await seed([
      makeBookmark({ id: "a", domain: "site1.com", tags: ["AI", "ML"] }),
      makeBookmark({ id: "b", domain: "site2.com", tags: ["AI", "ML"] }),
    ]);
    const suggestions = await suggestEdgesFor("a");
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].strength).toBe(4); // 2 tags * 2
    expect(suggestions[0].reason).toBe("shared tags: AI, ML");
  });

  it("does NOT trigger on 1 shared tag + different domain", async () => {
    await seed([
      makeBookmark({ id: "a", domain: "site1.com", tags: ["AI"] }),
      makeBookmark({ id: "b", domain: "site2.com", tags: ["AI"] }),
    ]);
    expect(await suggestEdgesFor("a")).toEqual([]);
  });

  it("does NOT trigger on same domain alone (no shared tags)", async () => {
    await seed([
      makeBookmark({ id: "a", domain: "example.com", tags: [] }),
      makeBookmark({ id: "b", domain: "example.com", tags: [] }),
    ]);
    expect(await suggestEdgesFor("a")).toEqual([]);
  });

  it("strength ranks higher-overlap pairs first; tie-breaks on updatedAt desc", async () => {
    const olderTs = 1_700_000_000_000;
    const newerTs = 1_800_000_000_000;
    await seed([
      makeBookmark({ id: "a", domain: "x.com", tags: ["AI", "ML", "papers"] }),
      // 2 tags + same domain => 5
      makeBookmark({
        id: "high",
        domain: "x.com",
        tags: ["AI", "ML"],
        createdAt: olderTs,
        updatedAt: olderTs,
      }),
      // 2 tags, different domain => 4
      makeBookmark({
        id: "midOld",
        domain: "y.com",
        tags: ["AI", "ML"],
        createdAt: olderTs,
        updatedAt: olderTs,
      }),
      makeBookmark({
        id: "midNew",
        domain: "y.com",
        tags: ["AI", "ML"],
        createdAt: newerTs,
        updatedAt: newerTs,
      }),
    ]);
    const suggestions = await suggestEdgesFor("a");
    expect(suggestions.map((s) => s.toId)).toEqual(["high", "midNew", "midOld"]);
  });

  it("excludes the subject itself even on perfect overlap", async () => {
    await seed([makeBookmark({ id: "a", domain: "example.com", tags: ["AI", "ML"] })]);
    expect(await suggestEdgesFor("a")).toEqual([]);
  });

  it("excludes pairs that already have a manual edge in either direction", async () => {
    await seed([
      makeBookmark({ id: "a", domain: "x.com", tags: ["AI", "ML"] }),
      makeBookmark({ id: "b", domain: "x.com", tags: ["AI", "ML"] }),
      makeBookmark({ id: "c", domain: "x.com", tags: ["AI", "ML"] }),
    ]);
    await createEdge({ fromId: "b", toId: "a", type: "related", source: "manual" });
    const suggestions = await suggestEdgesFor("a");
    expect(suggestions.map((s) => s.toId)).toEqual(["c"]);
  });

  it("excludes pairs the user has explicitly rejected in either order", async () => {
    await seed([
      makeBookmark({ id: "a", domain: "x.com", tags: ["AI", "ML"] }),
      makeBookmark({ id: "b", domain: "x.com", tags: ["AI", "ML"] }),
      makeBookmark({ id: "c", domain: "x.com", tags: ["AI", "ML"] }),
    ]);
    // Reject b→a; the pair store normalizes the direction.
    await rejectEdgePair("b", "a");
    const suggestions = await suggestEdgesFor("a");
    expect(suggestions.map((s) => s.toId)).toEqual(["c"]);
  });

  it("does NOT exclude pairs that only have auto-* edges between them", async () => {
    await seed([
      makeBookmark({ id: "a", domain: "x.com", tags: ["AI", "ML"] }),
      makeBookmark({ id: "b", domain: "x.com", tags: ["AI", "ML"] }),
    ]);
    await createEdge({ fromId: "a", toId: "b", type: "related", source: "auto-tag" });
    const suggestions = await suggestEdgesFor("a");
    expect(suggestions.map((s) => s.toId)).toEqual(["b"]);
  });

  it("treats tag matching as case-insensitive but preserves display case", async () => {
    await seed([
      makeBookmark({ id: "a", domain: "x.com", tags: ["AI", "ML"] }),
      makeBookmark({ id: "b", domain: "x.com", tags: ["ai", "ml"] }),
    ]);
    const suggestions = await suggestEdgesFor("a");
    expect(suggestions).toHaveLength(1);
    // We pull display case from the candidate.
    expect(suggestions[0].reason).toBe("same domain + shared tags: ai, ml");
  });

  it("honors the limit option", async () => {
    const bookmarks: Bookmark[] = [makeBookmark({ id: "a", domain: "x.com", tags: ["AI", "ML"] })];
    for (let i = 0; i < 20; i++) {
      bookmarks.push(makeBookmark({ id: `b${i}`, domain: "x.com", tags: ["AI", "ML"] }));
    }
    await seed(bookmarks);
    const suggestions = await suggestEdgesFor("a", { limit: 5 });
    expect(suggestions).toHaveLength(5);
  });

  it("defaults to top 10 results when no limit given", async () => {
    const bookmarks: Bookmark[] = [makeBookmark({ id: "a", domain: "x.com", tags: ["AI", "ML"] })];
    for (let i = 0; i < 25; i++) {
      bookmarks.push(makeBookmark({ id: `b${i}`, domain: "x.com", tags: ["AI", "ML"] }));
    }
    await seed(bookmarks);
    const suggestions = await suggestEdgesFor("a");
    expect(suggestions).toHaveLength(10);
  });

  it("returns empty list when the subject bookmark does not exist", async () => {
    await seed([makeBookmark({ id: "b", domain: "x.com", tags: ["AI", "ML"] })]);
    expect(await suggestEdgesFor("ghost")).toEqual([]);
  });

  it("ignores empty domain when checking sameDomain", async () => {
    await seed([
      makeBookmark({ id: "a", domain: "", tags: ["AI"] }),
      makeBookmark({ id: "b", domain: "", tags: ["AI"] }),
    ]);
    // 1 tag + empty-domain match should NOT pass the rule.
    expect(await suggestEdgesFor("a")).toEqual([]);
  });

  it("marks source as auto-tag whenever shared tags exist", async () => {
    await seed([
      makeBookmark({ id: "a", domain: "x.com", tags: ["AI", "ML"] }),
      makeBookmark({ id: "b", domain: "y.com", tags: ["AI", "ML"] }),
    ]);
    const [s] = await suggestEdgesFor("a");
    expect(s.source).toBe("auto-tag");
  });

  it("returns related edge type by default", async () => {
    await seed([
      makeBookmark({ id: "a", domain: "x.com", tags: ["AI", "ML"] }),
      makeBookmark({ id: "b", domain: "x.com", tags: ["AI", "ML"] }),
    ]);
    const [s] = await suggestEdgesFor("a");
    expect(s.type).toBe("related");
    expect(s.directed).toBe(false);
  });
});

describe("materializeSuggestion", () => {
  it("writes a suggestion as a manual edge that listEdgesFor returns", async () => {
    await seed([
      makeBookmark({ id: "a", domain: "x.com", tags: ["AI", "ML"] }),
      makeBookmark({ id: "b", domain: "x.com", tags: ["AI", "ML"] }),
    ]);
    const [suggestion] = await suggestEdgesFor("a");
    expect(suggestion).toBeDefined();
    const edge = await materializeSuggestion(suggestion);
    expect(edge.source).toBe("manual");
    expect(edge.fromId).toBe("a");
    expect(edge.toId).toBe("b");
    expect(edge.type).toBe("related");

    const visible = await listEdgesFor("a");
    expect(visible.map((e) => e.id)).toContain(edge.id);
  });

  it("once materialized, the same pair no longer appears in suggestions", async () => {
    await seed([
      makeBookmark({ id: "a", domain: "x.com", tags: ["AI", "ML"] }),
      makeBookmark({ id: "b", domain: "x.com", tags: ["AI", "ML"] }),
    ]);
    const [suggestion] = await suggestEdgesFor("a");
    await materializeSuggestion(suggestion);
    const next = await suggestEdgesFor("a");
    expect(next).toEqual([]);
  });

  it("is idempotent: materializing twice does not create duplicate rows", async () => {
    await seed([
      makeBookmark({ id: "a", domain: "x.com", tags: ["AI", "ML"] }),
      makeBookmark({ id: "b", domain: "x.com", tags: ["AI", "ML"] }),
    ]);
    const [suggestion] = await suggestEdgesFor("a");
    const first = await materializeSuggestion(suggestion);
    const second = await materializeSuggestion(suggestion);
    expect(second.id).toBe(first.id);
    expect(await listAllEdges()).toHaveLength(1);
  });
});
