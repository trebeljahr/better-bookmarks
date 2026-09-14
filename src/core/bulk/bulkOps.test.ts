import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Bookmark } from "../../shared/types";
import { getDB, resetDBForTests } from "../storage/db";
import { bulkAddTag, bulkDelete, bulkRemoveTag, bulkSetRating, bulkSetStatus } from "./index";

const COUNT = 1000;
const CHUNK = 100;
const THROW_AT = 500; // must land inside the loop, not on the final chunk

// fake-indexeddb + 1000-row chunked writes routinely take 5-15s in CI; the
// 5s default aborts them mid-transaction and reports a phantom failure. The
// operation itself is correct — see the passing small-corpus suites for the
// verb-level guarantees.
const LARGE_CORPUS_TIMEOUT_MS = 30_000;

function makeCorpus(n: number): Bookmark[] {
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => {
    const id = `bm-${String(i).padStart(6, "0")}`;
    return {
      id,
      canonicalUrl: `https://example.com/${i}`,
      originalUrl: `https://example.com/${i}`,
      domain: "example.com",
      title: `Bookmark ${i}`,
      description: "",
      note: "",
      tags: ["seed"],
      rating: null,
      necessaryTime: null,
      contentType: "unknown" as const,
      language: null,
      status: "unread" as const,
      readAt: null,
      createdAt: now - (n - i),
      updatedAt: now - (n - i),
      capturedFrom: "manual" as const,
    };
  });
}

async function seed(n: number): Promise<Bookmark[]> {
  const corpus = makeCorpus(n);
  await getDB().bookmarks.bulkAdd(corpus);
  return corpus;
}

beforeEach(async () => {
  await getDB().bookmarks.clear();
});

afterEach(() => {
  resetDBForTests();
});

describe("bulkAddTag at 1000 bookmarks", { timeout: LARGE_CORPUS_TIMEOUT_MS }, () => {
  it("adds the tag to every selected record", async () => {
    const corpus = await seed(COUNT);
    const ids = corpus.map((b) => b.id);

    const result = await bulkAddTag(ids, "reading-list", { chunkSize: CHUNK });

    expect(result.updated).toBe(COUNT);
    const tagged = await getDB().bookmarks.where("tags").equals("reading-list").count();
    expect(tagged).toBe(COUNT);

    // Existing tags survive; dedup keeps entries unique.
    const sample = await getDB().bookmarks.get(ids[0]);
    expect(sample?.tags).toContain("seed");
    expect(sample?.tags).toContain("reading-list");
    expect(new Set(sample?.tags ?? []).size).toBe(sample?.tags.length);
  });

  it("rolls back cleanly on a simulated mid-op throw (no half-applied state)", async () => {
    const corpus = await seed(COUNT);
    const ids = corpus.map((b) => b.id);
    const boom = new Error("simulated mid-op failure");

    let seen: number | null = null;
    let caught: unknown = null;
    try {
      await bulkAddTag(ids, "should-not-persist", {
        chunkSize: CHUNK,
        onChunk: (processed) => {
          if (processed >= THROW_AT) {
            seen = processed;
            throw boom;
          }
        },
      });
    } catch (e) {
      caught = e;
    }

    // The throw propagated out.
    expect(caught).toBe(boom);
    expect(seen).toBe(THROW_AT);

    // Atomicity: not one bookmark carries the tag, even though several
    // chunks completed their bulkPut before the throw fired.
    const anyTagged = await getDB().bookmarks.where("tags").equals("should-not-persist").count();
    expect(anyTagged).toBe(0);

    // Total row count is unchanged.
    expect(await getDB().bookmarks.count()).toBe(COUNT);

    // Every original tag list is untouched (updatedAt included).
    for (const original of corpus) {
      const now = await getDB().bookmarks.get(original.id);
      expect(now?.tags).toEqual(original.tags);
      expect(now?.updatedAt).toBe(original.updatedAt);
    }
  });
});

describe("bulkRemoveTag", () => {
  it("removes the tag from every record that carries it and leaves others alone", async () => {
    const corpus = await seed(50);
    // Give half the corpus an extra tag, so we can prove the untouched half
    // stays exactly as it was.
    const marked = corpus.slice(0, 25).map((b) => ({ ...b, tags: [...b.tags, "obsolete"] }));
    await getDB().bookmarks.bulkPut(marked);

    const result = await bulkRemoveTag(
      corpus.map((b) => b.id),
      "obsolete",
    );

    expect(result.updated).toBe(25);
    // Nobody still has the tag.
    const stillTagged = await getDB().bookmarks.where("tags").equals("obsolete").count();
    expect(stillTagged).toBe(0);
    // The seed tag survives on every record.
    const seedTagged = await getDB().bookmarks.where("tags").equals("seed").count();
    expect(seedTagged).toBe(50);
  });

  it("is case-insensitive", async () => {
    const corpus = await seed(3);
    await getDB().bookmarks.put({ ...corpus[0], tags: ["Reading-List"] });

    const result = await bulkRemoveTag([corpus[0].id], "reading-list");
    expect(result.updated).toBe(1);
    const after = await getDB().bookmarks.get(corpus[0].id);
    expect(after?.tags.some((t) => t.toLowerCase() === "reading-list")).toBe(false);
  });

  it("throws on empty tag input rather than silently no-op'ing", async () => {
    await expect(bulkRemoveTag(["irrelevant"], "   ")).rejects.toThrow(/non-empty/);
  });
});

describe("bulkSetRating", () => {
  it("sets the rating on every selected record", async () => {
    const corpus = await seed(10);
    const ids = corpus.map((b) => b.id);
    const result = await bulkSetRating(ids, 8);
    expect(result.updated).toBe(10);
    const rows = await getDB().bookmarks.where("id").anyOf(ids).toArray();
    expect(rows.every((b) => b.rating === 8)).toBe(true);
  });

  it("accepts null to clear the rating", async () => {
    const corpus = await seed(5);
    await getDB().bookmarks.bulkPut(corpus.map((b) => ({ ...b, rating: 7 })));
    const ids = corpus.map((b) => b.id);
    const result = await bulkSetRating(ids, null);
    expect(result.updated).toBe(5);
    const rows = await getDB().bookmarks.where("id").anyOf(ids).toArray();
    expect(rows.every((b) => b.rating === null)).toBe(true);
  });

  it("rejects out-of-range ratings", async () => {
    await expect(bulkSetRating(["x"], 11)).rejects.toThrow(/range/);
    await expect(bulkSetRating(["x"], -1)).rejects.toThrow(/range/);
  });
});

describe("bulkSetStatus", () => {
  it("sets status to read and stamps readAt", async () => {
    const corpus = await seed(5);
    const ids = corpus.map((b) => b.id);
    const result = await bulkSetStatus(ids, "read");
    expect(result.updated).toBe(5);
    const rows = await getDB().bookmarks.where("id").anyOf(ids).toArray();
    expect(rows.every((b) => b.status === "read")).toBe(true);
    expect(rows.every((b) => typeof b.readAt === "number" && b.readAt > 0)).toBe(true);
  });

  it("clears readAt when moving back to unread", async () => {
    const corpus = await seed(3);
    const ids = corpus.map((b) => b.id);
    await bulkSetStatus(ids, "read");
    await bulkSetStatus(ids, "unread");
    const rows = await getDB().bookmarks.where("id").anyOf(ids).toArray();
    expect(rows.every((b) => b.status === "unread")).toBe(true);
    expect(rows.every((b) => b.readAt === null)).toBe(true);
  });

  it("preserves readAt on archive so the read history isn't lost", async () => {
    const corpus = await seed(2);
    const ids = corpus.map((b) => b.id);
    await bulkSetStatus(ids, "read");
    const readTimes = await getDB()
      .bookmarks.where("id")
      .anyOf(ids)
      .toArray()
      .then((rows) => rows.map((b) => b.readAt));
    await bulkSetStatus(ids, "archived");
    const rows = await getDB().bookmarks.where("id").anyOf(ids).toArray();
    expect(rows.every((b) => b.status === "archived")).toBe(true);
    expect(rows.map((b) => b.readAt)).toEqual(readTimes);
  });
});

describe("bulkDelete at 1000 bookmarks", { timeout: LARGE_CORPUS_TIMEOUT_MS }, () => {
  it("deletes every selected record", async () => {
    const corpus = await seed(COUNT);
    const ids = corpus.map((b) => b.id);

    const result = await bulkDelete(ids, { chunkSize: CHUNK });

    expect(result.deleted).toBe(COUNT);
    expect(await getDB().bookmarks.count()).toBe(0);
  });

  it("rolls back cleanly on a simulated mid-op throw (no half-applied state)", async () => {
    const corpus = await seed(COUNT);
    const ids = corpus.map((b) => b.id);
    const boom = new Error("simulated mid-op failure");

    let seen: number | null = null;
    let caught: unknown = null;
    try {
      await bulkDelete(ids, {
        chunkSize: CHUNK,
        onChunk: (processed) => {
          if (processed >= THROW_AT) {
            seen = processed;
            throw boom;
          }
        },
      });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBe(boom);
    expect(seen).toBe(THROW_AT);

    // Atomicity: every id is still present, even though several chunks
    // completed their bulkDelete before the throw fired.
    expect(await getDB().bookmarks.count()).toBe(COUNT);

    // Spot-check that the specific ids inside the pre-throw chunks came
    // back — they'd be the ones a broken implementation would leak.
    const preThrowSample = corpus.slice(0, THROW_AT).map((b) => b.id);
    const stillPresent = await getDB().bookmarks.where("id").anyOf(preThrowSample).primaryKeys();
    expect(stillPresent.length).toBe(preThrowSample.length);
  });
});
