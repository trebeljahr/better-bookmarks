import { describe, expect, it } from "vitest";
import type { Bookmark } from "../../shared/types";
import { chromeChangeWins, resolveTitleUrl } from "./conflictResolver";

const baseBookmark: Pick<Bookmark, "title" | "originalUrl" | "updatedAt"> = {
  title: "store-title",
  originalUrl: "https://example.com/store",
  updatedAt: 1000,
};

describe("resolveTitleUrl", () => {
  it("prefer-chrome takes chrome", () => {
    const r = resolveTitleUrl(
      baseBookmark,
      { title: "chrome-title", url: "https://example.com/chrome", eventAt: 500 },
      "prefer-chrome",
    );
    expect(r.source).toBe("chrome");
    expect(r.title).toBe("chrome-title");
  });

  it("prefer-store keeps store", () => {
    const r = resolveTitleUrl(
      baseBookmark,
      { title: "chrome-title", url: "https://example.com/chrome", eventAt: 2000 },
      "prefer-store",
    );
    expect(r.source).toBe("store");
    expect(r.title).toBe("store-title");
  });

  it("prefer-newer: chrome event newer wins", () => {
    const r = resolveTitleUrl(
      baseBookmark,
      { title: "chrome-title", url: "https://example.com/chrome", eventAt: 2000 },
      "prefer-newer",
    );
    expect(r.source).toBe("chrome");
  });

  it("prefer-newer: store newer wins", () => {
    const r = resolveTitleUrl(
      baseBookmark,
      { title: "chrome-title", url: "https://example.com/chrome", eventAt: 500 },
      "prefer-newer",
    );
    expect(r.source).toBe("store");
  });

  it("prefer-newer: tie keeps store", () => {
    const r = resolveTitleUrl(
      baseBookmark,
      { title: "chrome-title", url: "https://example.com/chrome", eventAt: 1000 },
      "prefer-newer",
    );
    expect(r.source).toBe("store");
  });

  it("ask defers to store while user prompt pending", () => {
    const r = resolveTitleUrl(
      baseBookmark,
      { title: "chrome-title", url: "https://example.com/chrome", eventAt: 5000 },
      "ask",
    );
    expect(r.source).toBe("store");
  });
});

describe("chromeChangeWins", () => {
  it("strictly newer chrome event wins", () => {
    expect(chromeChangeWins(100, 200)).toBe(true);
    expect(chromeChangeWins(200, 100)).toBe(false);
    expect(chromeChangeWins(100, 100)).toBe(false);
  });
});
