import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listBookmarks, upsertBookmark } from "../storage/bookmarks";
import { getDB, resetDBForTests } from "../storage/db";
import { upsertTag } from "../storage/tags";
import { setTagMirror } from "./folderMirror";
import { handleChanged, handleCreated, handleMoved, handleRemoved } from "./handlers";
import { inFlight } from "./inFlight";
import { getMappingByChromeId, listAllMappings, upsertMapping } from "./mapping";

beforeEach(async () => {
  const db = getDB();
  await db.bookmarks.clear();
  await db.chromeMappings.clear();
  await db.tags.clear();
  inFlight.clear();
  // settings reads from chrome.storage.local; provide a stub so default policy applies
  // biome-ignore lint/suspicious/noExplicitAny: test wiring
  (globalThis as any).chrome = {
    storage: {
      local: {
        get: vi.fn(async () => ({})),
        set: vi.fn(async () => {}),
      },
    },
  };
});

afterEach(() => {
  resetDBForTests();
  // biome-ignore lint/suspicious/noExplicitAny: test cleanup
  delete (globalThis as any).chrome;
});

describe("handleCreated", () => {
  it("creates new bookmark + mapping from inbound url", async () => {
    await handleCreated({
      id: "c1",
      url: "https://a.test/x?utm_source=y",
      title: "A",
      parentId: "p",
    });
    const all = await listBookmarks();
    expect(all).toHaveLength(1);
    expect(all[0].canonicalUrl).toBe("https://a.test/x");
    expect(all[0].capturedFrom).toBe("chrome-sync");
    const mapping = await getMappingByChromeId("c1");
    expect(mapping?.bookmarkId).toBe(all[0].id);
  });

  it("dedups when canonical url already exists", async () => {
    const seed = await upsertBookmark({ rawUrl: "https://a.test/x" });
    if (!seed.ok) throw new Error("seed");
    await handleCreated({
      id: "c1",
      url: "https://a.test/x?utm_source=y",
      title: "A",
      parentId: "p",
    });
    expect((await listBookmarks()).length).toBe(1);
    const mapping = await getMappingByChromeId("c1");
    expect(mapping?.bookmarkId).toBe(seed.bookmark.id);
  });

  it("creates folder mapping when no url present", async () => {
    await handleCreated({ id: "f1", title: "Folder", parentId: "p" });
    const mapping = await getMappingByChromeId("f1");
    expect(mapping?.isFolder).toBe(true);
    expect(mapping?.bookmarkId).toBe(null);
  });

  it("inFlight-token echo only updates mapping, does not create duplicate", async () => {
    const seed = await upsertBookmark({ rawUrl: "https://a.test/x" });
    if (!seed.ok) throw new Error("seed");
    inFlight.add("create", "p::https://a.test/x");
    await handleCreated({ id: "c1", url: "https://a.test/x", title: "A", parentId: "p" });
    expect((await listBookmarks()).length).toBe(1);
  });
});

describe("handleChanged", () => {
  it("updates title via prefer-newer when event is newer", async () => {
    const seed = await upsertBookmark({ rawUrl: "https://a.test/", title: "old" });
    if (!seed.ok) throw new Error("seed");
    await upsertMapping({
      chromeId: "c1",
      bookmarkId: seed.bookmark.id,
      isFolder: false,
      parentChromeId: null,
      lastKnownTitle: "old",
      lastKnownUrl: "https://a.test/",
      lastKnownParentId: null,
      eventAt: seed.bookmark.updatedAt - 1000,
    });
    await handleChanged({ id: "c1", title: "new" }, seed.bookmark.updatedAt + 1000);
    const after = (await listBookmarks())[0];
    expect(after.title).toBe("new");
  });

  it("inFlight echo no-ops on bookmark but still touches event time", async () => {
    const seed = await upsertBookmark({ rawUrl: "https://a.test/", title: "stable" });
    if (!seed.ok) throw new Error("seed");
    await upsertMapping({
      chromeId: "c1",
      bookmarkId: seed.bookmark.id,
      isFolder: false,
      parentChromeId: null,
      lastKnownTitle: "stable",
      lastKnownUrl: "https://a.test/",
      lastKnownParentId: null,
      eventAt: 100,
    });
    inFlight.add("update", "c1");
    await handleChanged({ id: "c1", title: "ignored" }, 5000);
    const m = await getMappingByChromeId("c1");
    expect(m?.lastKnownEventAt).toBe(5000);
    const b = (await listBookmarks())[0];
    expect(b.title).toBe("stable");
  });
});

describe("handleRemoved", () => {
  it("drops mapping; bookmark stays when mapping was last", async () => {
    const seed = await upsertBookmark({ rawUrl: "https://a.test/" });
    if (!seed.ok) throw new Error("seed");
    await upsertMapping({
      chromeId: "c1",
      bookmarkId: seed.bookmark.id,
      isFolder: false,
      parentChromeId: null,
      lastKnownTitle: "",
      lastKnownUrl: "https://a.test/",
      lastKnownParentId: null,
    });
    await handleRemoved("c1");
    expect(await listAllMappings()).toHaveLength(0);
    expect(await listBookmarks()).toHaveLength(1);
  });

  it("inFlight echo cleanly drops mapping", async () => {
    await upsertMapping({
      chromeId: "c1",
      bookmarkId: null,
      isFolder: true,
      parentChromeId: null,
      lastKnownTitle: "",
      lastKnownUrl: "",
      lastKnownParentId: null,
    });
    inFlight.add("remove", "c1");
    await handleRemoved("c1");
    expect(await getMappingByChromeId("c1")).toBeUndefined();
  });
});

describe("handleMoved", () => {
  it("adds mirrored-folder tag when entering, drops when leaving", async () => {
    const seed = await upsertBookmark({ rawUrl: "https://a.test/", tags: [] });
    if (!seed.ok) throw new Error("seed");
    await upsertTag({ name: "Mirror" });
    await setTagMirror("Mirror", "fNew");

    await upsertMapping({
      chromeId: "c1",
      bookmarkId: seed.bookmark.id,
      isFolder: false,
      parentChromeId: "fOld",
      lastKnownTitle: "",
      lastKnownUrl: "https://a.test/",
      lastKnownParentId: "fOld",
    });

    await handleMoved({ id: "c1", parentId: "fNew", oldParentId: "fOld" });

    const after = (await listBookmarks())[0];
    expect(after.tags).toContain("Mirror");
  });
});
