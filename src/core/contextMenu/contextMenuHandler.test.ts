import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listBookmarks, upsertBookmark } from "../storage/bookmarks";
import { getDB, resetDBForTests } from "../storage/db";
import { buildContextMenus, computeTopTags, handleContextMenuClick } from "./contextMenuHandler";

type CreatedMenu = chrome.contextMenus.CreateProperties & { id: string };

type FakeContextMenus = {
  removeAll: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  onClicked: { addListener: ReturnType<typeof vi.fn> };
};

type FakeAction = {
  openPopup: ReturnType<typeof vi.fn>;
};

function installChrome(opts: { withOpenPopup?: boolean } = {}): {
  menus: CreatedMenu[];
  contextMenus: FakeContextMenus;
  action?: FakeAction;
} {
  const menus: CreatedMenu[] = [];
  const contextMenus: FakeContextMenus = {
    removeAll: vi.fn((cb?: () => void) => {
      menus.length = 0;
      if (cb) cb();
    }),
    create: vi.fn((props: chrome.contextMenus.CreateProperties) => {
      menus.push(props as CreatedMenu);
      return props.id ?? "";
    }),
    onClicked: { addListener: vi.fn() },
  };
  const action: FakeAction | undefined = opts.withOpenPopup
    ? { openPopup: vi.fn(async () => undefined) }
    : undefined;
  // biome-ignore lint/suspicious/noExplicitAny: test wiring
  (globalThis as any).chrome = { contextMenus, action };
  return { menus, contextMenus, action };
}

beforeEach(async () => {
  await getDB().bookmarks.clear();
});

afterEach(() => {
  resetDBForTests();
  // biome-ignore lint/suspicious/noExplicitAny: test cleanup
  delete (globalThis as any).chrome;
  vi.restoreAllMocks();
});

describe("computeTopTags", () => {
  it("returns the most frequent tags first, capped at the limit", async () => {
    await upsertBookmark({ rawUrl: "https://a.example.com/", tags: ["foo", "bar"] });
    await upsertBookmark({ rawUrl: "https://b.example.com/", tags: ["foo", "baz"] });
    await upsertBookmark({ rawUrl: "https://c.example.com/", tags: ["foo"] });
    await upsertBookmark({ rawUrl: "https://d.example.com/", tags: ["bar"] });

    const top = await computeTopTags(2);
    expect(top).toEqual(["foo", "bar"]);
  });

  it("breaks ties alphabetically", async () => {
    await upsertBookmark({ rawUrl: "https://a.example.com/", tags: ["zeta", "alpha"] });
    await upsertBookmark({ rawUrl: "https://b.example.com/", tags: ["alpha", "zeta"] });

    const top = await computeTopTags(8);
    expect(top).toEqual(["alpha", "zeta"]);
  });

  it("returns an empty array when no bookmarks exist", async () => {
    const top = await computeTopTags();
    expect(top).toEqual([]);
  });
});

describe("buildContextMenus", () => {
  it("creates the two add-items plus the tag submenu", async () => {
    const { menus } = installChrome();
    await buildContextMenus(async () => ["foo", "bar", "baz"]);

    const ids = menus.map((m) => m.id);
    expect(ids).toContain("bb-add");
    expect(ids).toContain("bb-add-with-note");
    expect(ids).toContain("bb-tag-parent");
    expect(ids).toContain("bb-tag:foo");
    expect(ids).toContain("bb-tag:bar");
    expect(ids).toContain("bb-tag:baz");
  });

  it("skips the tag submenu when there are no tags", async () => {
    const { menus } = installChrome();
    await buildContextMenus(async () => []);
    const ids = menus.map((m) => m.id);
    expect(ids).toEqual(["bb-add", "bb-add-with-note"]);
  });

  it("removes existing menus before recreating", async () => {
    const { contextMenus } = installChrome();
    await buildContextMenus(async () => ["foo"]);
    await buildContextMenus(async () => ["bar"]);
    expect(contextMenus.removeAll).toHaveBeenCalledTimes(2);
  });
});

describe("handleContextMenuClick", () => {
  it("adds a bookmark from a page context using the tab url/title", async () => {
    installChrome();
    await handleContextMenuClick({
      info: { menuItemId: "bb-add" } as chrome.contextMenus.OnClickData,
      tab: {
        url: "https://example.com/article",
        title: "Hello Article",
      } as chrome.tabs.Tab,
    });

    const all = await listBookmarks();
    expect(all).toHaveLength(1);
    expect(all[0]?.originalUrl).toBe("https://example.com/article");
    expect(all[0]?.title).toBe("Hello Article");
    expect(all[0]?.capturedFrom).toBe("manual");
  });

  it("prefers info.linkUrl + info.selectionText for the link context", async () => {
    installChrome();
    await handleContextMenuClick({
      info: {
        menuItemId: "bb-add",
        linkUrl: "https://example.com/linked",
        selectionText: "anchor text",
      } as chrome.contextMenus.OnClickData,
      tab: {
        url: "https://outer.example.com/",
        title: "Outer page",
      } as chrome.tabs.Tab,
    });

    const all = await listBookmarks();
    expect(all).toHaveLength(1);
    expect(all[0]?.originalUrl).toBe("https://example.com/linked");
    expect(all[0]?.title).toBe("anchor text");
  });

  it("applies the tag from a tag-submenu click", async () => {
    installChrome();
    await handleContextMenuClick({
      info: { menuItemId: "bb-tag:reading" } as chrome.contextMenus.OnClickData,
      tab: {
        url: "https://example.com/post",
        title: "Post",
      } as chrome.tabs.Tab,
    });

    const all = await listBookmarks();
    expect(all[0]?.tags).toContain("reading");
  });

  it("opens the popup after the add-with-note variant when available", async () => {
    const { action } = installChrome({ withOpenPopup: true });
    await handleContextMenuClick({
      info: { menuItemId: "bb-add-with-note" } as chrome.contextMenus.OnClickData,
      tab: {
        url: "https://example.com/foo",
        title: "Foo",
      } as chrome.tabs.Tab,
    });

    expect(action?.openPopup).toHaveBeenCalledTimes(1);
    const all = await listBookmarks();
    expect(all).toHaveLength(1);
  });

  it("ignores click events for unrelated menu ids", async () => {
    installChrome();
    await handleContextMenuClick({
      info: { menuItemId: "some-other-extension-menu" } as chrome.contextMenus.OnClickData,
      tab: { url: "https://example.com/" } as chrome.tabs.Tab,
    });
    expect(await listBookmarks()).toHaveLength(0);
  });

  it("no-ops when neither linkUrl nor tab.url is present", async () => {
    installChrome();
    await handleContextMenuClick({
      info: { menuItemId: "bb-add" } as chrome.contextMenus.OnClickData,
      tab: { title: "no url" } as chrome.tabs.Tab,
    });
    expect(await listBookmarks()).toHaveLength(0);
  });
});
