import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDB, resetDBForTests } from "../storage/db";
import {
  deleteMapping,
  getMappingByChromeId,
  getMappingsByBookmarkId,
  listAllMappings,
  touchEventAt,
  upsertMapping,
} from "./mapping";

beforeEach(async () => {
  await getDB().chromeMappings.clear();
});

afterEach(() => {
  resetDBForTests();
});

describe("mapping", () => {
  it("upsert + get round-trips", async () => {
    await upsertMapping({
      chromeId: "c1",
      bookmarkId: "b1",
      isFolder: false,
      parentChromeId: "p",
      lastKnownTitle: "t",
      lastKnownUrl: "https://a.test/",
      lastKnownParentId: "p",
    });
    const m = await getMappingByChromeId("c1");
    expect(m?.bookmarkId).toBe("b1");
    expect(m?.lastKnownUrl).toBe("https://a.test/");
  });

  it("getMappingsByBookmarkId returns all chrome copies", async () => {
    await upsertMapping({
      chromeId: "c1",
      bookmarkId: "b1",
      isFolder: false,
      parentChromeId: "p1",
      lastKnownTitle: "t",
      lastKnownUrl: "https://x.test/",
      lastKnownParentId: "p1",
    });
    await upsertMapping({
      chromeId: "c2",
      bookmarkId: "b1",
      isFolder: false,
      parentChromeId: "p2",
      lastKnownTitle: "t",
      lastKnownUrl: "https://x.test/",
      lastKnownParentId: "p2",
    });
    const found = await getMappingsByBookmarkId("b1");
    expect(found.map((m) => m.chromeId).sort()).toEqual(["c1", "c2"]);
  });

  it("deleteMapping removes only the matching row", async () => {
    await upsertMapping({
      chromeId: "c1",
      bookmarkId: "b1",
      isFolder: false,
      parentChromeId: null,
      lastKnownTitle: "",
      lastKnownUrl: "https://1/",
      lastKnownParentId: null,
    });
    await upsertMapping({
      chromeId: "c2",
      bookmarkId: "b2",
      isFolder: false,
      parentChromeId: null,
      lastKnownTitle: "",
      lastKnownUrl: "https://2/",
      lastKnownParentId: null,
    });
    await deleteMapping("c1");
    expect(await listAllMappings()).toHaveLength(1);
    expect((await listAllMappings())[0].chromeId).toBe("c2");
  });

  it("touchEventAt updates timestamp without changing other fields", async () => {
    await upsertMapping({
      chromeId: "c1",
      bookmarkId: "b1",
      isFolder: false,
      parentChromeId: null,
      lastKnownTitle: "stay",
      lastKnownUrl: "https://x/",
      lastKnownParentId: null,
      eventAt: 1000,
    });
    await touchEventAt("c1", 5000);
    const m = await getMappingByChromeId("c1");
    expect(m?.lastKnownEventAt).toBe(5000);
    expect(m?.lastKnownTitle).toBe("stay");
  });
});
