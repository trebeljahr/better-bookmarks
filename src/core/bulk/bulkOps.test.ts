import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Bookmark } from "../../shared/types";
import { getDB, resetDBForTests } from "../storage/db";
import { bulkAddTag, bulkDelete } from "./index";

const COUNT = 1000;
const CHUNK = 100;
const THROW_AT = 500; // must land inside the loop, not on the final chunk

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

describe("bulkAddTag at 1000 bookmarks", () => {
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

describe("bulkDelete at 1000 bookmarks", () => {
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
