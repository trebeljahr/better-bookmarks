import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Bookmark, Edge, Tag } from "../../shared/types";
import { createEdge, listAllEdges } from "../edges/crud";
import { listBookmarks, upsertBookmark } from "../storage/bookmarks";
import { getDB, resetDBForTests } from "../storage/db";
import { listTags, upsertTag } from "../storage/tags";
import { exportJson, importJson, JSON_EXPORT_VERSION } from "./json";

async function clearAll(): Promise<void> {
  const db = getDB();
  await db.bookmarks.clear();
  await db.tags.clear();
  await db.edges.clear();
}

beforeEach(async () => {
  await clearAll();
});

afterEach(() => {
  resetDBForTests();
});

describe("exportJson", () => {
  it("emits versioned, pretty-printed snapshot", async () => {
    await upsertBookmark({ rawUrl: "https://example.com/a", title: "A" });
    await upsertTag({ name: "tagX" });
    const json = await exportJson();
    expect(json).toContain("\n  "); // pretty-printed
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(JSON_EXPORT_VERSION);
    expect(typeof parsed.exportedAt).toBe("number");
    expect(Array.isArray(parsed.bookmarks)).toBe(true);
    expect(Array.isArray(parsed.tags)).toBe(true);
    expect(Array.isArray(parsed.edges)).toBe(true);
  });
});

describe("importJson round-trip", () => {
  it("export → clear → import yields equivalent state", async () => {
    const r1 = await upsertBookmark({
      rawUrl: "https://example.com/a",
      title: "A",
      tags: ["alpha", "beta"],
      rating: 7,
    });
    const r2 = await upsertBookmark({
      rawUrl: "https://github.com/foo/bar",
      title: "B",
      tags: ["alpha"],
    });
    if (!r1.ok || !r2.ok) throw new Error("seed failed");

    await upsertTag({ name: "alpha", color: "#f00", description: "first letter" });
    await upsertTag({ name: "beta" });
    await createEdge({
      fromId: r1.bookmark.id,
      toId: r2.bookmark.id,
      type: "related",
      note: "see also",
    });

    const beforeBookmarks = await listBookmarks();
    const beforeTags = await listTags();
    const beforeEdges = await listAllEdges();
    const json = await exportJson();

    await clearAll();
    expect((await listBookmarks()).length).toBe(0);

    const report = await importJson(json);
    expect(report.bookmarksImported).toBe(2);
    expect(report.tagsImported).toBe(2);
    expect(report.edgesImported).toBe(1);

    const afterBookmarks = await listBookmarks();
    const afterTags = await listTags();
    const afterEdges = await listAllEdges();

    expect(sortById(afterBookmarks)).toEqual(sortById(beforeBookmarks));
    expect(sortByName(afterTags)).toEqual(sortByName(beforeTags));
    expect(sortById(afterEdges)).toEqual(sortById(beforeEdges));
  });

  it("re-import on populated DB merges rather than duplicating", async () => {
    const r = await upsertBookmark({ rawUrl: "https://example.com/x", title: "X" });
    if (!r.ok) throw new Error("seed failed");
    const json = await exportJson();
    const report = await importJson(json);
    expect(report.bookmarksMerged).toBe(1);
    expect(report.bookmarksImported).toBe(0);
    expect((await listBookmarks()).length).toBe(1);
  });
});

describe("importJson version handling", () => {
  it("throws on unknown version", async () => {
    const payload = JSON.stringify({ version: 99, bookmarks: [], tags: [], edges: [] });
    await expect(importJson(payload)).rejects.toThrow(/unsupported version/i);
  });

  it("throws when version field is missing", async () => {
    const payload = JSON.stringify({ bookmarks: [], tags: [], edges: [] });
    await expect(importJson(payload)).rejects.toThrow(/version/i);
  });
});

describe("importJson tightens canonical URL on import", () => {
  it("recomputes canonicalUrl from originalUrl using current rules", async () => {
    // Simulate a record written before a canonicalization rule existed: the
    // stored canonicalUrl is the same as originalUrl (no stripping). On
    // re-import, canonicalUrl should be recomputed and shed the utm_source.
    const db = getDB();
    const stale: Bookmark = {
      id: "01STALE0000000000000000000",
      canonicalUrl: "https://example.com/stale?utm_source=newsletter",
      originalUrl: "https://example.com/stale?utm_source=newsletter",
      domain: "example.com",
      title: "Stale",
      description: "",
      note: "",
      tags: [],
      rating: null,
      necessaryTime: null,
      contentType: "unknown",
      language: null,
      status: "unread",
      readAt: null,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      capturedFrom: "manual",
    };
    await db.bookmarks.put(stale);

    const json = await exportJson();
    await clearAll();
    await importJson(json);

    const reimported = await listBookmarks();
    expect(reimported).toHaveLength(1);
    expect(reimported[0].originalUrl).toBe("https://example.com/stale?utm_source=newsletter");
    expect(reimported[0].canonicalUrl).toBe("https://example.com/stale");
  });
});

describe("importJson dryRun", () => {
  it("counts without mutating", async () => {
    const seed: Bookmark = {
      id: "01DRYRUN0000000000000000000",
      canonicalUrl: "https://example.com/dr",
      originalUrl: "https://example.com/dr",
      domain: "example.com",
      title: "DR",
      description: "",
      note: "",
      tags: [],
      rating: null,
      necessaryTime: null,
      contentType: "unknown",
      language: null,
      status: "unread",
      readAt: null,
      createdAt: 1,
      updatedAt: 1,
      capturedFrom: "manual",
    };
    const payload = JSON.stringify({
      version: JSON_EXPORT_VERSION,
      exportedAt: 0,
      bookmarks: [seed],
      tags: [] as Tag[],
      edges: [] as Edge[],
    });
    const report = await importJson(payload, { dryRun: true });
    expect(report.bookmarksImported).toBe(1);
    expect((await listBookmarks()).length).toBe(0);
  });
});

describe("importJson skips bad records", () => {
  it("skips bookmarks with unparseable URLs", async () => {
    const bad: Bookmark = {
      id: "01BAD00000000000000000000",
      canonicalUrl: "not-a-url",
      originalUrl: "not-a-url",
      domain: "",
      title: "Bad",
      description: "",
      note: "",
      tags: [],
      rating: null,
      necessaryTime: null,
      contentType: "unknown",
      language: null,
      status: "unread",
      readAt: null,
      createdAt: 1,
      updatedAt: 1,
      capturedFrom: "manual",
    };
    const payload = JSON.stringify({
      version: JSON_EXPORT_VERSION,
      exportedAt: 0,
      bookmarks: [bad],
      tags: [],
      edges: [],
    });
    const report = await importJson(payload);
    expect(report.bookmarksSkipped).toBe(1);
    expect((await listBookmarks()).length).toBe(0);
  });
});

function sortById<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.id.localeCompare(b.id));
}
function sortByName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}
