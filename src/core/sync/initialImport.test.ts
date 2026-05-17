import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
});
