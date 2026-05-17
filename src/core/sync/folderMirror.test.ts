import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDB, resetDBForTests } from "../storage/db";
import { upsertTag } from "../storage/tags";
import { ancestorFolderNames, listMirroredTags, setTagMirror } from "./folderMirror";

beforeEach(async () => {
  await getDB().tags.clear();
});

afterEach(() => {
  resetDBForTests();
});

describe("ancestorFolderNames", () => {
  it("walks up parents and skips synthetic roots", () => {
    const byId: Record<string, chrome.bookmarks.BookmarkTreeNode> = {
      "1": { id: "1", title: "Bookmarks bar", parentId: "0" },
      "10": { id: "10", title: "Programming", parentId: "1" },
      "20": { id: "20", title: "Rust", parentId: "10" },
      "30": { id: "30", title: "leaf", url: "https://example.com/", parentId: "20" },
    };
    const names = ancestorFolderNames("20", byId);
    expect(names).toEqual(["Rust", "Programming"]);
  });

  it("returns empty when started on a synthetic root", () => {
    const byId: Record<string, chrome.bookmarks.BookmarkTreeNode> = {
      "0": { id: "0", title: "" },
      "1": { id: "1", title: "Bookmarks bar", parentId: "0" },
    };
    const names = ancestorFolderNames("1", byId);
    expect(names).toEqual([]);
  });

  it("returns empty when start id missing", () => {
    expect(ancestorFolderNames(undefined, {})).toEqual([]);
  });
});

describe("tag mirror", () => {
  it("setTagMirror persists, listMirroredTags returns it", async () => {
    await upsertTag({ name: "AI" });
    await setTagMirror("AI", "folder-42");
    const mirrored = await listMirroredTags();
    expect(mirrored.map((t) => t.name)).toEqual(["AI"]);
    expect(mirrored[0].mirrorFolderId).toBe("folder-42");
  });

  it("setting mirror to null removes it", async () => {
    await upsertTag({ name: "AI" });
    await setTagMirror("AI", "folder-42");
    await setTagMirror("AI", null);
    const mirrored = await listMirroredTags();
    expect(mirrored).toEqual([]);
  });
});
