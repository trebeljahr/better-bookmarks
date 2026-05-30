import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getBookmarkById, updateBookmark, upsertBookmark } from "@/core/storage/bookmarks";
import { getDB, resetDBForTests } from "@/core/storage/db";
import { listTags } from "@/core/storage/tags";
import {
  applyDrop,
  applyUntaggedDrop,
  type DragPayload,
  parsePayload,
  serializePayload,
} from "./useBookmarkDnd";

beforeEach(async () => {
  await getDB().bookmarks.clear();
  await getDB().tags.clear();
});

afterEach(() => {
  resetDBForTests();
});

async function seed(url: string, tags: string[] = []): Promise<string> {
  const r = await upsertBookmark({ rawUrl: url, tags });
  if (!r.ok) throw new Error("seed failed");
  return r.bookmark.id;
}

describe("DragPayload serialization", () => {
  it("round-trips through JSON", () => {
    const p: DragPayload = { kind: "bookmarks", ids: ["a", "b"], sourceTag: "foo" };
    const s = serializePayload(p);
    expect(parsePayload(s)).toEqual(p);
  });

  it("returns null for malformed payloads", () => {
    expect(parsePayload(null)).toBeNull();
    expect(parsePayload("")).toBeNull();
    expect(parsePayload("not json")).toBeNull();
    expect(parsePayload(JSON.stringify({ kind: "other", ids: [] }))).toBeNull();
  });
});

describe("applyDrop", () => {
  it("adds the target tag and ensures the Tag record exists", async () => {
    const id = await seed("https://a.example.com/");
    const changed = await applyDrop({ kind: "bookmarks", ids: [id], sourceTag: null }, "frontend");
    expect(changed).toBe(1);
    const b = await getBookmarkById(id);
    expect(b?.tags).toContain("frontend");
    const tags = await listTags();
    expect(tags.some((t) => t.lowercaseName === "frontend")).toBe(true);
  });

  it("removes sourceTag when different from target", async () => {
    const id = await seed("https://a.example.com/", ["react"]);
    const changed = await applyDrop(
      { kind: "bookmarks", ids: [id], sourceTag: "react" },
      "frontend",
    );
    expect(changed).toBe(1);
    const b = await getBookmarkById(id);
    expect(b?.tags).toEqual(["frontend"]);
  });

  it("is a no-op when sourceTag equals target (case-insensitive)", async () => {
    const id = await seed("https://a.example.com/", ["React"]);
    const changed = await applyDrop({ kind: "bookmarks", ids: [id], sourceTag: "react" }, "REACT");
    expect(changed).toBe(0);
    const b = await getBookmarkById(id);
    expect(b?.tags).toEqual(["React"]);
  });

  it("processes multiple ids in one drop", async () => {
    const a = await seed("https://a.example.com/");
    const b = await seed("https://b.example.com/");
    const c = await seed("https://c.example.com/", ["frontend"]);
    const changed = await applyDrop(
      { kind: "bookmarks", ids: [a, b, c], sourceTag: null },
      "frontend",
    );
    // c already has the tag and gets skipped; a and b are modified.
    expect(changed).toBe(2);
  });
});

describe("applyUntaggedDrop", () => {
  it("clears tags on dropped bookmarks", async () => {
    const id = await seed("https://a.example.com/", ["react", "ai"]);
    const changed = await applyUntaggedDrop({ kind: "bookmarks", ids: [id], sourceTag: null });
    expect(changed).toBe(1);
    const b = await getBookmarkById(id);
    expect(b?.tags).toEqual([]);
  });

  it("skips already-untagged bookmarks", async () => {
    const id = await seed("https://a.example.com/");
    await updateBookmark(id, { tags: [] });
    const changed = await applyUntaggedDrop({ kind: "bookmarks", ids: [id], sourceTag: null });
    expect(changed).toBe(0);
  });
});
