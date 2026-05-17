import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listBookmarks } from "../storage/bookmarks";
import { getDB, resetDBForTests } from "../storage/db";
import { importRawUrlList, parseRawUrlList } from "./rawUrlList";

beforeEach(async () => {
  await getDB().bookmarks.clear();
});

afterEach(() => {
  resetDBForTests();
});

const SAMPLE = `# This is a comment
https://example.com/a

# Another comment
https://example.com/b   # foo, bar
   https://example.com/c#anchor # baz

https://example.com/d?utm_source=email#tag
`;

describe("parseRawUrlList", () => {
  it("skips empty lines and full-line comments", () => {
    const entries = parseRawUrlList(SAMPLE);
    expect(entries.map((e) => e.url)).toContain("https://example.com/a");
    expect(entries.length).toBeGreaterThanOrEqual(3);
  });

  it("parses inline #-suffix as comma-delimited tags", () => {
    const entries = parseRawUrlList(SAMPLE);
    const b = entries.find((e) => e.url === "https://example.com/b");
    expect(b?.tags).toEqual(["foo", "bar"]);
  });

  it("preserves URL fragment but splits tags on whitespace-preceded #", () => {
    const entries = parseRawUrlList(SAMPLE);
    const c = entries.find((e) => e.url.startsWith("https://example.com/c"));
    expect(c?.url).toBe("https://example.com/c#anchor");
    expect(c?.tags).toEqual(["baz"]);
  });

  it("does NOT treat URL fragment as tag separator when no whitespace before #", () => {
    const entries = parseRawUrlList("https://example.com/p#section1\n");
    expect(entries).toHaveLength(1);
    expect(entries[0].url).toBe("https://example.com/p#section1");
    expect(entries[0].tags).toEqual([]);
  });

  it("returns no entries for empty input", () => {
    expect(parseRawUrlList("")).toEqual([]);
    expect(parseRawUrlList("# just a comment")).toEqual([]);
  });
});

describe("importRawUrlList", () => {
  it("inserts urls with capturedFrom=manual and canonicalizes", async () => {
    const report = await importRawUrlList(SAMPLE);
    expect(report.imported).toBeGreaterThanOrEqual(3);
    const all = await listBookmarks();
    const d = all.find((b) => b.canonicalUrl.startsWith("https://example.com/d"));
    expect(d?.canonicalUrl).not.toContain("utm_source");
    expect(d?.capturedFrom).toBe("manual");
  });

  it("dedupes within the same import", async () => {
    const report = await importRawUrlList(
      "https://example.com/x?utm_source=a\nhttps://example.com/x?utm_source=b\n",
    );
    expect(report.imported).toBe(1);
    expect(report.merged).toBe(1);
  });
});
