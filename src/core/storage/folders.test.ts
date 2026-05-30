import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ChromeMapping } from "../../shared/types";
import { upsertMapping } from "../sync/mapping";
import { getDB, resetDBForTests } from "./db";
import {
  bookmarkIdsInFolders,
  buildFolderForest,
  collectFolderSubtreeIds,
  folderBookmarkCounts,
  listFolders,
} from "./folders";

const FOLDER_ROOTS: ReadonlyArray<[string, string]> = [
  ["1", "Bookmarks bar"],
  ["2", "Other bookmarks"],
];

async function seed(): Promise<void> {
  // Top-level synthetic containers (parent = "0").
  for (const [id, title] of FOLDER_ROOTS) {
    await upsertMapping({
      chromeId: id,
      bookmarkId: null,
      isFolder: true,
      parentChromeId: "0",
      lastKnownTitle: title,
      lastKnownUrl: "",
      lastKnownParentId: "0",
    });
  }
  // Bookmarks bar > Programming > Rust
  await upsertMapping({
    chromeId: "10",
    bookmarkId: null,
    isFolder: true,
    parentChromeId: "1",
    lastKnownTitle: "Programming",
    lastKnownUrl: "",
    lastKnownParentId: "1",
  });
  await upsertMapping({
    chromeId: "20",
    bookmarkId: null,
    isFolder: true,
    parentChromeId: "10",
    lastKnownTitle: "Rust",
    lastKnownUrl: "",
    lastKnownParentId: "10",
  });
  // Bookmark in Programming (directly).
  await upsertMapping({
    chromeId: "100",
    bookmarkId: "bm-a",
    isFolder: false,
    parentChromeId: "10",
    lastKnownTitle: "a",
    lastKnownUrl: "https://a.example/",
    lastKnownParentId: "10",
  });
  // Bookmark in Rust (descendant).
  await upsertMapping({
    chromeId: "200",
    bookmarkId: "bm-b",
    isFolder: false,
    parentChromeId: "20",
    lastKnownTitle: "b",
    lastKnownUrl: "https://b.example/",
    lastKnownParentId: "20",
  });
  // Bookmark in Other bookmarks (separate root subtree).
  await upsertMapping({
    chromeId: "300",
    bookmarkId: "bm-c",
    isFolder: false,
    parentChromeId: "2",
    lastKnownTitle: "c",
    lastKnownUrl: "https://c.example/",
    lastKnownParentId: "2",
  });
}

beforeEach(async () => {
  await getDB().chromeMappings.clear();
});

afterEach(() => {
  resetDBForTests();
});

describe("buildFolderForest", () => {
  it("groups folders into a tree rooted at top-level containers", async () => {
    await seed();
    const folders = await listFolders();
    const forest = buildFolderForest(folders);
    expect(forest.map((n) => n.title)).toEqual(["Bookmarks bar", "Other bookmarks"]);
    const programming = forest[0].children[0];
    expect(programming.title).toBe("Programming");
    expect(programming.children.map((c) => c.title)).toEqual(["Rust"]);
  });

  it("skips the absolute root (chromeId 0)", () => {
    const folders: ChromeMapping[] = [
      {
        chromeId: "0",
        bookmarkId: null,
        isFolder: true,
        parentChromeId: null,
        lastSyncedAt: 0,
        lastKnownEventAt: 0,
        lastKnownTitle: "",
        lastKnownUrl: "",
        lastKnownParentId: null,
      },
    ];
    expect(buildFolderForest(folders)).toEqual([]);
  });
});

describe("collectFolderSubtreeIds", () => {
  it("includes the start folder and all descendants", async () => {
    await seed();
    const all = await listFolders();
    const ids = collectFolderSubtreeIds("10", all);
    expect(Array.from(ids).sort()).toEqual(["10", "20"]);
  });

  it("returns just the start when no children", async () => {
    await seed();
    const all = await listFolders();
    const ids = collectFolderSubtreeIds("20", all);
    expect(Array.from(ids)).toEqual(["20"]);
  });
});

describe("bookmarkIdsInFolders", () => {
  it("returns recursive bookmark ids across the subtree", async () => {
    await seed();
    const ids = await bookmarkIdsInFolders(["10"]);
    expect(ids).not.toBeNull();
    expect(Array.from(ids ?? new Set()).sort()).toEqual(["bm-a", "bm-b"]);
  });

  it("unions multiple folder ids", async () => {
    await seed();
    const ids = await bookmarkIdsInFolders(["20", "2"]);
    expect(Array.from(ids ?? new Set()).sort()).toEqual(["bm-b", "bm-c"]);
  });

  it("returns null when no folders given", async () => {
    expect(await bookmarkIdsInFolders([])).toBeNull();
  });
});

describe("folderBookmarkCounts", () => {
  it("counts bookmarks recursively per folder", async () => {
    await seed();
    const counts = await folderBookmarkCounts();
    expect(counts["1"]).toBe(2); // Bookmarks bar (Programming + Rust)
    expect(counts["10"]).toBe(2); // Programming + Rust
    expect(counts["20"]).toBe(1); // Rust only
    expect(counts["2"]).toBe(1); // Other bookmarks
  });

  it("dedups when one bookmark is mirrored into the same folder twice", async () => {
    await upsertMapping({
      chromeId: "1",
      bookmarkId: null,
      isFolder: true,
      parentChromeId: "0",
      lastKnownTitle: "Bookmarks bar",
      lastKnownUrl: "",
      lastKnownParentId: "0",
    });
    await upsertMapping({
      chromeId: "n1",
      bookmarkId: "bm-dup",
      isFolder: false,
      parentChromeId: "1",
      lastKnownTitle: "x",
      lastKnownUrl: "https://x.example/",
      lastKnownParentId: "1",
    });
    await upsertMapping({
      chromeId: "n2",
      bookmarkId: "bm-dup",
      isFolder: false,
      parentChromeId: "1",
      lastKnownTitle: "x",
      lastKnownUrl: "https://x.example/",
      lastKnownParentId: "1",
    });
    const counts = await folderBookmarkCounts();
    expect(counts["1"]).toBe(1);
  });
});
