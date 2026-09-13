import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listBookmarks } from "../storage/bookmarks";
import { getDB, resetDBForTests } from "../storage/db";
import { importRawUrls, parseRawUrls } from "./rawUrls";

beforeEach(async () => {
  await getDB().bookmarks.clear();
});

afterEach(() => {
  resetDBForTests();
  vi.restoreAllMocks();
});

describe("parseRawUrls", () => {
  it("returns an empty array for empty input", () => {
    expect(parseRawUrls("")).toEqual([]);
  });

  it("skips blank lines", () => {
    expect(parseRawUrls("\n\nhttps://example.com/a\n\n")).toEqual([
      "https://example.com/a",
    ]);
  });

  it("skips lines that start with # after leading whitespace", () => {
    const text = [
      "# top-level comment",
      "   # indented comment",
      "https://example.com/a",
      "# another comment",
      "https://example.com/b",
    ].join("\n");
    expect(parseRawUrls(text)).toEqual([
      "https://example.com/a",
      "https://example.com/b",
    ]);
  });

  it("preserves URL fragments (does NOT treat # inside a URL as a comment)", () => {
    // The comment marker only fires when `#` is the FIRST non-whitespace
    // character on the line. A URL like `https://x.com/p#section` must
    // survive intact — enrichment / deep-linking depends on it.
    expect(parseRawUrls("https://example.com/page#section\n")).toEqual([
      "https://example.com/page#section",
    ]);
  });

  it("trims trailing whitespace from each URL line", () => {
    expect(parseRawUrls("  https://example.com/a  \n")).toEqual([
      "https://example.com/a",
    ]);
  });

  it("handles CRLF line endings", () => {
    expect(parseRawUrls("https://example.com/a\r\nhttps://example.com/b\r\n")).toEqual([
      "https://example.com/a",
      "https://example.com/b",
    ]);
  });

  it("returns nothing when the input is only comments and blanks", () => {
    expect(parseRawUrls("# just a comment\n\n#another\n")).toEqual([]);
  });
});

describe("importRawUrls", () => {
  it("imports each URL with capturedFrom=manual and canonicalizes on ingest", async () => {
    const text = [
      "# my reading list",
      "https://example.com/a",
      "https://example.com/b?utm_source=email",
      "",
      "https://example.com/c",
    ].join("\n");
    const report = await importRawUrls(text);
    expect(report.imported).toBe(3);
    expect(report.merged).toBe(0);
    expect(report.rejected).toBe(0);

    const all = await listBookmarks();
    expect(all).toHaveLength(3);
    for (const b of all) {
      expect(b.capturedFrom).toBe("manual");
      // No metadata written on ingest — title/tags/rating stay empty
      // so enrichment can fill them in later.
      expect(b.title).toBe("");
      expect(b.tags).toEqual([]);
      expect(b.rating).toBeNull();
    }

    const withTracking = all.find((b) => b.canonicalUrl.startsWith("https://example.com/b"));
    expect(withTracking?.canonicalUrl).not.toContain("utm_source");
  });

  it("dedupes within the same batch by canonical URL", async () => {
    const text = [
      "https://example.com/x?utm_source=twitter",
      "https://example.com/x?utm_source=email",
      "https://example.com/x",
    ].join("\n");
    const report = await importRawUrls(text);
    expect(report.imported).toBe(1);
    expect(report.merged).toBe(2);
    expect(report.rejected).toBe(0);

    const all = await listBookmarks();
    expect(all).toHaveLength(1);
    expect(all[0].canonicalUrl).toBe("https://example.com/x");
  });

  it("skips invalid URLs with a warn log instead of throwing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const text = [
      "https://example.com/a",
      "not-a-url",
      "javascript:alert(1)",
      "https://example.com/b",
    ].join("\n");

    // Must not throw even though two lines fail canonicalisation.
    const report = await importRawUrls(text);
    expect(report.imported).toBe(2);
    expect(report.merged).toBe(0);
    expect(report.rejected).toBe(2);

    expect(warn).toHaveBeenCalledTimes(2);
    // The warn payload must include the offending URL so the user can
    // find it in devtools.
    expect(warn.mock.calls.some(([msg]) => String(msg).includes("not-a-url"))).toBe(true);
    expect(
      warn.mock.calls.some(([msg]) => String(msg).includes("javascript:alert(1)")),
    ).toBe(true);

    const all = await listBookmarks();
    expect(all).toHaveLength(2);
  });

  it("returns a zeroed report for an empty / all-comments input", async () => {
    const report = await importRawUrls("# only comments\n\n#\n");
    expect(report).toEqual({ imported: 0, merged: 0, rejected: 0 });
    expect(await listBookmarks()).toHaveLength(0);
  });
});
