/**
 * apply + undo round-trip tests.
 *
 * Exercises every HealthAction type through `applyFinding` and
 * `undoSnapshot`. Uses a real Dexie store via fake-indexeddb (set up in
 * src/test/setup.ts) so the integration with the actual DB layer is
 * covered, not just the in-memory shape.
 *
 * Chrome sync is intentionally not mocked — when `chrome.bookmarks` is
 * absent (the test environment), the Dexie hooks installed by the sync
 * layer don't reach across. The "sync off → no Chrome calls" case is
 * trivially true here; we only assert local-store invariants.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Bookmark } from "../../shared/types";
import { upsertBookmark } from "../storage/bookmarks";
import { getDB, resetDBForTests } from "../storage/db";
import { upsertTag } from "../storage/tags";
import {
  applyFinding,
  fingerprintForBookmarkIds,
  fingerprintForFinding,
  mergeRecords,
  undoSnapshot,
} from "./apply";
import { UndoBuffer } from "./undo";

beforeEach(async () => {
  const db = getDB();
  await db.bookmarks.clear();
  await db.tags.clear();
  await db.chromeMappings.clear();
});

afterEach(() => {
  resetDBForTests();
});

async function seedBookmark(rawUrl: string, overrides: Partial<Bookmark> = {}): Promise<Bookmark> {
  const result = await upsertBookmark({
    rawUrl,
    title: overrides.title ?? "T",
    tags: overrides.tags,
    note: overrides.note,
    description: overrides.description,
    rating: overrides.rating,
    necessaryTime: overrides.necessaryTime,
    status: overrides.status,
  });
  if (!result.ok) throw new Error(`upsert failed: ${result.reason.reason}`);
  if (overrides.id || overrides.createdAt || overrides.readAt !== undefined) {
    const db = getDB();
    const next: Bookmark = {
      ...result.bookmark,
      ...overrides,
    };
    if (overrides.id && overrides.id !== result.bookmark.id) {
      await db.bookmarks.delete(result.bookmark.id);
      await db.bookmarks.put(next);
      return next;
    }
    await db.bookmarks.put(next);
    return next;
  }
  return result.bookmark;
}

describe("applyFinding: set-title", () => {
  it("rewrites the title and snapshots the previous value", async () => {
    const buffer = new UndoBuffer();
    const bm = await seedBookmark("https://example.com/a", { title: "OLD" });
    const result = await applyFinding(
      { type: "set-title", bookmarkId: bm.id, newTitle: "NEW" },
      { buffer },
    );

    const after = await getDB().bookmarks.get(bm.id);
    expect(after?.title).toBe("NEW");
    expect(result.snapshot.bookmarks[0].title).toBe("OLD");
    expect(buffer.peek(result.snapshot.id)).toBeTruthy();
  });

  it("undo restores the original title", async () => {
    const buffer = new UndoBuffer();
    const bm = await seedBookmark("https://example.com/a", { title: "ORIG" });
    const { snapshot } = await applyFinding(
      { type: "set-title", bookmarkId: bm.id, newTitle: "EDIT" },
      { buffer },
    );
    await undoSnapshot(snapshot.id, { buffer });
    const after = await getDB().bookmarks.get(bm.id);
    expect(after?.title).toBe("ORIG");
  });
});

describe("applyFinding: add-tag", () => {
  it("adds the tag to the bookmark and creates the tag row if missing", async () => {
    const buffer = new UndoBuffer();
    const bm = await seedBookmark("https://example.com/a", { tags: [] });
    await applyFinding({ type: "add-tag", bookmarkId: bm.id, tag: "Learning" }, { buffer });
    const after = await getDB().bookmarks.get(bm.id);
    expect(after?.tags).toContain("Learning");
    const tag = await getDB().tags.where("lowercaseName").equals("learning").first();
    expect(tag).toBeTruthy();
  });

  it("undo removes the tag from the bookmark and drops the freshly created tag", async () => {
    const buffer = new UndoBuffer();
    const bm = await seedBookmark("https://example.com/a", { tags: [] });
    const { snapshot } = await applyFinding(
      { type: "add-tag", bookmarkId: bm.id, tag: "Learning" },
      { buffer },
    );
    await undoSnapshot(snapshot.id, { buffer });
    const after = await getDB().bookmarks.get(bm.id);
    expect(after?.tags).not.toContain("Learning");
    const tag = await getDB().tags.where("lowercaseName").equals("learning").first();
    expect(tag).toBeUndefined();
  });

  it("does not re-create a pre-existing tag on undo", async () => {
    const buffer = new UndoBuffer();
    await upsertTag({ name: "Learning" });
    const bm = await seedBookmark("https://example.com/a", { tags: [] });
    const { snapshot } = await applyFinding(
      { type: "add-tag", bookmarkId: bm.id, tag: "learning" },
      { buffer },
    );
    await undoSnapshot(snapshot.id, { buffer });
    const tag = await getDB().tags.where("lowercaseName").equals("learning").first();
    // Pre-existing tag should survive the undo unchanged.
    expect(tag?.name).toBe("Learning");
  });
});

describe("applyFinding: rename-tag", () => {
  it("renames the tag on every carrier bookmark and undo restores original casing", async () => {
    const buffer = new UndoBuffer();
    await upsertTag({ name: "React" });
    const a = await seedBookmark("https://example.com/a", { tags: ["React"] });
    const b = await seedBookmark("https://example.com/b", { tags: ["React"] });
    const { snapshot } = await applyFinding(
      { type: "rename-tag", from: "React", to: "react" },
      { buffer },
    );

    const aAfter = await getDB().bookmarks.get(a.id);
    const bAfter = await getDB().bookmarks.get(b.id);
    expect(aAfter?.tags).toContain("react");
    expect(bAfter?.tags).toContain("react");
    expect(aAfter?.tags).not.toContain("React");

    await undoSnapshot(snapshot.id, { buffer });
    const aRestored = await getDB().bookmarks.get(a.id);
    const bRestored = await getDB().bookmarks.get(b.id);
    expect(aRestored?.tags).toContain("React");
    expect(bRestored?.tags).toContain("React");
    expect(aRestored?.tags).not.toContain("react");
  });
});

describe("applyFinding: merge-bookmarks", () => {
  it("merges losers into the survivor and deletes losers", async () => {
    const buffer = new UndoBuffer();
    const survivor = await seedBookmark("https://example.com/a", {
      title: "Long Survivor Title",
      tags: ["a"],
      rating: 5,
      note: "first note",
    });
    const loser = await seedBookmark("https://example.com/b", {
      title: "Loser",
      tags: ["b", "c"],
      rating: 8,
      note: "second note",
    });
    await applyFinding(
      { type: "merge-bookmarks", survivorId: survivor.id, loserIds: [loser.id] },
      { buffer },
    );
    const merged = await getDB().bookmarks.get(survivor.id);
    const gone = await getDB().bookmarks.get(loser.id);
    expect(gone).toBeUndefined();
    expect(merged?.tags).toEqual(["a", "b", "c"]);
    expect(merged?.rating).toBe(8); // max rating
    expect(merged?.note).toBe("first note\n\n---\n\nsecond note");
  });

  it("undo restores losers and reverts survivor", async () => {
    const buffer = new UndoBuffer();
    const survivor = await seedBookmark("https://example.com/a", {
      title: "S",
      tags: ["a"],
    });
    const loser = await seedBookmark("https://example.com/b", {
      title: "L",
      tags: ["b"],
    });
    const { snapshot } = await applyFinding(
      { type: "merge-bookmarks", survivorId: survivor.id, loserIds: [loser.id] },
      { buffer },
    );
    await undoSnapshot(snapshot.id, { buffer });
    const survivorRestored = await getDB().bookmarks.get(survivor.id);
    const loserRestored = await getDB().bookmarks.get(loser.id);
    expect(survivorRestored?.tags).toEqual(["a"]);
    expect(loserRestored?.tags).toEqual(["b"]);
  });
});

describe("applyFinding: delete-bookmark", () => {
  it("deletes the bookmark and undo restores it", async () => {
    const buffer = new UndoBuffer();
    const bm = await seedBookmark("https://example.com/a", { title: "DEL" });
    const { snapshot } = await applyFinding(
      { type: "delete-bookmark", bookmarkId: bm.id },
      { buffer },
    );
    expect(await getDB().bookmarks.get(bm.id)).toBeUndefined();
    await undoSnapshot(snapshot.id, { buffer });
    const restored = await getDB().bookmarks.get(bm.id);
    expect(restored?.title).toBe("DEL");
  });
});

describe("mergeRecords (pure)", () => {
  function fixtureBookmark(overrides: Partial<Bookmark>): Bookmark {
    return {
      id: "x",
      canonicalUrl: "https://example.com/x",
      originalUrl: "https://example.com/x",
      domain: "example.com",
      title: "",
      description: "",
      note: "",
      tags: [],
      rating: null,
      necessaryTime: null,
      contentType: "unknown",
      language: null,
      status: "unread",
      readAt: null,
      createdAt: 100,
      updatedAt: 100,
      capturedFrom: "manual",
      ...overrides,
    };
  }

  it("most-progressed status wins (archived > read > reading > unread)", () => {
    const survivor = fixtureBookmark({ id: "s", status: "unread" });
    const merged = mergeRecords(survivor, [
      fixtureBookmark({ id: "a", status: "read" }),
      fixtureBookmark({ id: "b", status: "archived" }),
    ]);
    expect(merged.status).toBe("archived");
  });

  it("earliest createdAt wins", () => {
    const survivor = fixtureBookmark({ id: "s", createdAt: 200 });
    const merged = mergeRecords(survivor, [fixtureBookmark({ id: "a", createdAt: 50 })]);
    expect(merged.createdAt).toBe(50);
  });

  it("survivor's title is preserved unless empty", () => {
    const survivor = fixtureBookmark({ id: "s", title: "Survivor" });
    const merged = mergeRecords(survivor, [
      fixtureBookmark({ id: "a", title: "Longer Loser Title" }),
    ]);
    expect(merged.title).toBe("Survivor");
  });

  it("empty survivor title falls back to longest loser", () => {
    const survivor = fixtureBookmark({ id: "s", title: "" });
    const merged = mergeRecords(survivor, [
      fixtureBookmark({ id: "a", title: "short" }),
      fixtureBookmark({ id: "b", title: "this is the longest" }),
    ]);
    expect(merged.title).toBe("this is the longest");
  });

  it("notes concat with separator, no de-dup", () => {
    const survivor = fixtureBookmark({ id: "s", note: "alpha" });
    const merged = mergeRecords(survivor, [fixtureBookmark({ id: "a", note: "beta" })]);
    expect(merged.note).toBe("alpha\n\n---\n\nbeta");
  });

  it("earliest readAt wins", () => {
    const survivor = fixtureBookmark({ id: "s", readAt: 200 });
    const merged = mergeRecords(survivor, [
      fixtureBookmark({ id: "a", readAt: 100 }),
      fixtureBookmark({ id: "b", readAt: null }),
    ]);
    expect(merged.readAt).toBe(100);
  });
});

describe("fingerprintForFinding", () => {
  it("prefers the explicit details.fingerprint when present", () => {
    const fp = fingerprintForFinding({
      bookmarkIds: ["b", "a"],
      details: { fingerprint: "custom" },
    });
    expect(fp).toBe("custom");
  });

  it("falls back to sorted bookmarkIds join", () => {
    const fp = fingerprintForFinding({ bookmarkIds: ["b", "a"] });
    expect(fp).toBe("a|b");
  });

  it("matches fingerprintForBookmarkIds for the fallback path", () => {
    expect(fingerprintForFinding({ bookmarkIds: ["x", "y"] })).toBe(
      fingerprintForBookmarkIds(["y", "x"]),
    );
  });
});
