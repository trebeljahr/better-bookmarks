import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bookmark } from "../../shared/types";

const searchMock = vi.fn();
vi.mock("../search", () => ({
  search: (...args: unknown[]) => searchMock(...args),
}));

import {
  handleInputChanged,
  handleInputEntered,
  installOmnibox,
  OMNIBOX_SUGGESTION_LIMIT,
  xmlEscape,
} from "./omniboxHandler";

type FakeOmnibox = {
  setDefaultSuggestion: ReturnType<typeof vi.fn>;
  onInputChanged: { addListener: ReturnType<typeof vi.fn> };
  onInputEntered: { addListener: ReturnType<typeof vi.fn> };
};

type FakeTabs = {
  update: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
};

type FakeChrome = {
  omnibox: FakeOmnibox;
  tabs: FakeTabs;
};

function installChrome(): FakeChrome {
  const fake: FakeChrome = {
    omnibox: {
      setDefaultSuggestion: vi.fn(),
      onInputChanged: { addListener: vi.fn() },
      onInputEntered: { addListener: vi.fn() },
    },
    tabs: {
      update: vi.fn(),
      create: vi.fn(),
    },
  };
  // biome-ignore lint/suspicious/noExplicitAny: test wiring
  (globalThis as any).chrome = fake;
  return fake;
}

function fakeBookmark(p: Partial<Bookmark>): Bookmark {
  return {
    id: p.id ?? "id-1",
    canonicalUrl: p.canonicalUrl ?? "https://example.com/",
    originalUrl: p.originalUrl ?? p.canonicalUrl ?? "https://example.com/",
    domain: p.domain ?? "example.com",
    title: p.title ?? "Example",
    description: p.description ?? "",
    note: p.note ?? "",
    tags: p.tags ?? [],
    rating: p.rating ?? null,
    necessaryTime: p.necessaryTime ?? null,
    contentType: p.contentType ?? "unknown",
    language: p.language ?? null,
    status: p.status ?? "unread",
    readAt: p.readAt ?? null,
    createdAt: p.createdAt ?? 1,
    updatedAt: p.updatedAt ?? 1,
    capturedFrom: p.capturedFrom ?? "manual",
  };
}

beforeEach(() => {
  searchMock.mockReset();
});

afterEach(() => {
  // biome-ignore lint/suspicious/noExplicitAny: test cleanup
  delete (globalThis as any).chrome;
  vi.restoreAllMocks();
});

describe("xmlEscape", () => {
  it("escapes the five XML metacharacters", () => {
    expect(xmlEscape(`A&B<C>D"E'F`)).toBe("A&amp;B&lt;C&gt;D&quot;E&apos;F");
  });

  it("is idempotent on safe input", () => {
    expect(xmlEscape("plain text 123")).toBe("plain text 123");
  });

  it("escapes & before angle brackets so existing entities are not double-encoded oddly", () => {
    // The order of replacements matters: `&` must go first so that the
    // `&` introduced by later replacements (`&lt;` etc) isn't re-escaped.
    expect(xmlEscape("<a>")).toBe("&lt;a&gt;");
  });
});

describe("installOmnibox", () => {
  it("sets default suggestion and registers both listeners", () => {
    const fake = installChrome();
    installOmnibox();
    expect(fake.omnibox.setDefaultSuggestion).toHaveBeenCalledWith({
      description: "Search Better Bookmarks: %s",
    });
    expect(fake.omnibox.onInputChanged.addListener).toHaveBeenCalledTimes(1);
    expect(fake.omnibox.onInputEntered.addListener).toHaveBeenCalledTimes(1);
  });
});

describe("handleInputChanged", () => {
  it("calls search with the suggestion limit and maps results to suggestions", async () => {
    installChrome();
    searchMock.mockResolvedValueOnce([
      fakeBookmark({
        id: "a",
        title: "Hacker News",
        domain: "news.ycombinator.com",
        originalUrl: "https://news.ycombinator.com/",
      }),
      fakeBookmark({
        id: "b",
        title: "Example",
        domain: "example.com",
        originalUrl: "https://example.com/page",
      }),
    ]);
    const suggest = vi.fn();
    await handleInputChanged("hn", suggest);

    expect(searchMock).toHaveBeenCalledWith("hn", { limit: OMNIBOX_SUGGESTION_LIMIT });
    expect(suggest).toHaveBeenCalledTimes(1);
    const results = suggest.mock.calls[0][0];
    expect(results).toEqual([
      {
        content: "https://news.ycombinator.com/",
        description: "Hacker News — news.ycombinator.com",
      },
      { content: "https://example.com/page", description: "Example — example.com" },
    ]);
  });

  it("XML-escapes title and domain in the description", async () => {
    installChrome();
    searchMock.mockResolvedValueOnce([
      fakeBookmark({
        title: `Tom & Jerry <3 "quotes"`,
        domain: "weird&site.com",
        originalUrl: "https://weird&site.com/x",
      }),
    ]);
    const suggest = vi.fn();
    await handleInputChanged("tom", suggest);
    expect(suggest.mock.calls[0][0][0].description).toBe(
      "Tom &amp; Jerry &lt;3 &quot;quotes&quot; — weird&amp;site.com",
    );
  });

  it("returns empty suggestions for blank input without calling search", async () => {
    installChrome();
    const suggest = vi.fn();
    await handleInputChanged("   ", suggest);
    expect(searchMock).not.toHaveBeenCalled();
    expect(suggest).toHaveBeenCalledWith([]);
  });

  it("falls back to canonicalUrl when title is empty", async () => {
    installChrome();
    searchMock.mockResolvedValueOnce([
      fakeBookmark({
        title: "",
        canonicalUrl: "https://example.com/foo",
        originalUrl: "https://example.com/foo",
        domain: "example.com",
      }),
    ]);
    const suggest = vi.fn();
    await handleInputChanged("foo", suggest);
    expect(suggest.mock.calls[0][0][0].description).toBe("https://example.com/foo — example.com");
  });
});

describe("handleInputEntered", () => {
  it("opens currentTab disposition via chrome.tabs.update", () => {
    const fake = installChrome();
    handleInputEntered("https://example.com/", "currentTab");
    expect(fake.tabs.update).toHaveBeenCalledWith({ url: "https://example.com/" });
    expect(fake.tabs.create).not.toHaveBeenCalled();
  });

  it("opens newForegroundTab via chrome.tabs.create with active: true", () => {
    const fake = installChrome();
    handleInputEntered("https://example.com/", "newForegroundTab");
    expect(fake.tabs.create).toHaveBeenCalledWith({ url: "https://example.com/", active: true });
  });

  it("opens newBackgroundTab via chrome.tabs.create with active: false", () => {
    const fake = installChrome();
    handleInputEntered("https://example.com/", "newBackgroundTab");
    expect(fake.tabs.create).toHaveBeenCalledWith({ url: "https://example.com/", active: false });
  });

  it("no-ops on empty url", () => {
    const fake = installChrome();
    handleInputEntered("", "currentTab");
    expect(fake.tabs.update).not.toHaveBeenCalled();
    expect(fake.tabs.create).not.toHaveBeenCalled();
  });
});
