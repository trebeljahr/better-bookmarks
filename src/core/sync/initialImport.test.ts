import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildSyntheticCorpus } from "@/test/fixtures/synthetic-corpus";
import { listBookmarks } from "../storage/bookmarks";
import { getDB, resetDBForTests } from "../storage/db";
import { importChromeTree } from "./initialImport";
import { listAllMappings } from "./mapping";

const SAMPLE_TREE: chrome.bookmarks.BookmarkTreeNode[] = [
  {
    id: "0",
    title: "",
    children: [
      {
        id: "1",
        title: "Bookmarks bar",
        parentId: "0",
        children: [
          {
            id: "10",
            title: "Programming",
            parentId: "1",
            children: [
              {
                id: "100",
                title: "Rust lang",
                parentId: "10",
                url: "https://www.rust-lang.org/?utm_source=foo",
                dateAdded: 1000,
              },
              {
                id: "101",
                title: "TypeScript",
                parentId: "10",
                url: "https://www.typescriptlang.org/",
                dateAdded: 2000,
              },
            ],
          },
          {
            id: "11",
            title: "AI",
            parentId: "1",
            children: [
              {
                id: "110",
                title: "Rust lang again",
                parentId: "11",
                url: "https://www.rust-lang.org/?utm_source=bar",
                dateAdded: 3000,
              },
            ],
          },
        ],
      },
    ],
  },
];

beforeEach(async () => {
  const db = getDB();
  await db.bookmarks.clear();
  await db.chromeMappings.clear();
});

afterEach(() => {
  resetDBForTests();
});

describe("importChromeTree", () => {
  it("imports + canonicalises + dedups across folders", async () => {
    const report = await importChromeTree(SAMPLE_TREE, () => 9999);
    expect(report.bookmarksSeen).toBe(3);
    expect(report.bookmarksCreated).toBe(2);
    expect(report.bookmarksMerged).toBe(1);

    const all = await listBookmarks();
    expect(all).toHaveLength(2);
    const rust = all.find((b) => b.canonicalUrl === "https://www.rust-lang.org/");
    expect(rust?.tags.sort()).toEqual(["AI", "Programming"]);
  });

  it("writes mappings for folders and bookmarks", async () => {
    await importChromeTree(SAMPLE_TREE, () => 9999);
    const mappings = await listAllMappings();
    const folderMappings = mappings.filter((m) => m.isFolder);
    const bookmarkMappings = mappings.filter((m) => !m.isFolder);
    expect(folderMappings.length).toBeGreaterThanOrEqual(2);
    expect(bookmarkMappings).toHaveLength(3);
  });

  it("is idempotent — running twice produces same store", async () => {
    await importChromeTree(SAMPLE_TREE, () => 9999);
    const before = await listBookmarks();
    await importChromeTree(SAMPLE_TREE, () => 9999);
    const after = await listBookmarks();
    expect(after).toHaveLength(before.length);
  });

  // Scale guard. Drives importChromeTree with the shared 20k synthetic
  // corpus (see `src/test/fixtures/synthetic-corpus.ts`) and asserts:
  //
  //   1. The walk terminates and reports every URL node.
  //   2. Dedup is deterministic — created / merged counts derive from the
  //      fixture's own stats, so a drift in either the canonicaliser or the
  //      import merge path lights this test up.
  //   3. Heap growth across the import stays under a generous 400 MB
  //      ceiling. Regression guard, not an optimum — real-world browsers
  //      have plenty of headroom, but we want to catch a per-bookmark leak
  //      before it turns into a 2 GB blow-up on someone's 20k library.
  //
  // Timeout is loose: build + import + reindexAll on 20 k items in
  // fake-indexeddb runs in tens of seconds on a laptop.
  it("handles 20k corpus", async () => {
    const { tree, stats } = buildSyntheticCorpus();
    expect(stats.urlNodesInTree).toBe(20_000);

    // Best-effort GC before/after so the delta reflects retained heap,
    // not incidental allocation slack. Only works when Node is started
    // with `--expose-gc`; otherwise the delta is a loose upper bound,
    // which is fine — the ceiling is deliberately generous.
    const maybeGc = (globalThis as { gc?: () => void }).gc;
    if (maybeGc) maybeGc();
    const heapBefore = process.memoryUsage().heapUsed;

    const report = await importChromeTree(tree, () => 1_700_000_000_000);

    if (maybeGc) maybeGc();
    const heapAfter = process.memoryUsage().heapUsed;
    const heapDelta = heapAfter - heapBefore;

    // Every URL node was surfaced by the walk.
    expect(report.bookmarksSeen).toBe(stats.urlNodesInTree);
    // Deterministic dedup: fresh DB → created == unique canonical URLs,
    // merged == the tracking-param duplicates the fixture planted.
    expect(report.bookmarksCreated).toBe(stats.uniqueCanonicalUrls);
    expect(report.bookmarksMerged).toBe(stats.duplicateVariants);
    expect(report.rejected).toBe(0);

    // Persisted rows match the deduped count.
    const all = await listBookmarks();
    expect(all).toHaveLength(stats.uniqueCanonicalUrls);

    // 400 MB ceiling on heap growth across the import. Observed baseline
    // on 2026-09-09 was ~240 MB (Node without --expose-gc, so this
    // includes the whole fake-indexeddb store plus every posting
    // reindexAll writes — all retained on the JS heap for this
    // assertion, unlike production where IndexedDB lives outside it).
    // The ceiling is set at roughly 1.6x that so a genuine per-bookmark
    // leak trips it long before a run-to-run allocation wobble does.
    const HEAP_CEILING_BYTES = 400 * 1024 * 1024;
    expect(heapDelta).toBeLessThan(HEAP_CEILING_BYTES);
  }, 180_000);
});
