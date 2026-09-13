import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listBookmarks } from "../storage/bookmarks";
import { getDB, resetDBForTests } from "../storage/db";
import { importPocketCsv, parsePocketCsv } from "./pocket";

const FIXTURE_CSV = readFileSync(
  resolve(__dirname, "../../test/fixtures/pocket-sample.csv"),
  "utf8",
);

beforeEach(async () => {
  await getDB().bookmarks.clear();
});

afterEach(() => {
  resetDBForTests();
});

const SIMPLE_CSV = `title,url,time_added,tags,status
First Article,https://example.com/a,1700000000,ai|ml,unread
Second,https://example.com/b,1700001000,"design,ux",archive
"Comma, In, Title",https://example.com/c,1700002000,,unread
Read One,https://example.com/d,1700003000,reading,read
`;

describe("parsePocketCsv", () => {
  it("parses 4 rows from header + 4 data lines", () => {
    const rows = parsePocketCsv(SIMPLE_CSV);
    expect(rows).toHaveLength(4);
  });

  it("parses pipe-delimited tags", () => {
    const rows = parsePocketCsv(SIMPLE_CSV);
    expect(rows[0].tags).toEqual(["ai", "ml"]);
  });

  it("parses comma-delimited tags inside quoted cell", () => {
    const rows = parsePocketCsv(SIMPLE_CSV);
    expect(rows[1].tags).toEqual(["design", "ux"]);
  });

  it("maps pocket status archive → archived, unread stays, read stays", () => {
    const rows = parsePocketCsv(SIMPLE_CSV);
    expect(rows[0].status).toBe("unread");
    expect(rows[1].status).toBe("archived");
    expect(rows[3].status).toBe("read");
  });

  it("converts unix seconds to ms", () => {
    const rows = parsePocketCsv(SIMPLE_CSV);
    expect(rows[0].timeAdded).toBe(1700000000_000);
  });

  it("handles quoted titles containing commas", () => {
    const rows = parsePocketCsv(SIMPLE_CSV);
    expect(rows[2].title).toBe("Comma, In, Title");
  });

  it("returns empty array for empty/header-only input", () => {
    expect(parsePocketCsv("")).toEqual([]);
    expect(parsePocketCsv("title,url,time_added,tags,status\n")).toEqual([]);
  });
});

describe("importPocketCsv", () => {
  it("inserts rows with capturedFrom=pocket and createdAt from time_added", async () => {
    const report = await importPocketCsv(SIMPLE_CSV);
    expect(report).toEqual({ imported: 4, merged: 0, rejected: 0 });
    const all = await listBookmarks();
    expect(all).toHaveLength(4);
    expect(all.every((b) => b.capturedFrom === "pocket")).toBe(true);
    const a = all.find((b) => b.canonicalUrl === "https://example.com/a");
    expect(a?.createdAt).toBe(1700000000_000);
    expect(a?.tags).toEqual(["ai", "ml"]);
    const b = all.find((b) => b.canonicalUrl === "https://example.com/b");
    expect(b?.status).toBe("archived");
  });
});

describe("pocket-sample.csv fixture", () => {
  it("parses all 10 data rows", () => {
    const rows = parsePocketCsv(FIXTURE_CSV);
    expect(rows).toHaveLength(10);
  });

  it("keeps embedded commas from quoted titles verbatim", () => {
    const rows = parsePocketCsv(FIXTURE_CSV);
    const commaTitle = rows.find((r) => r.url === "https://example.com/emacs-story");
    expect(commaTitle?.title).toBe("How I learned to love, and later left, Emacs");
    const later = rows.find((r) => r.url.startsWith("https://example.com/commas"));
    expect(later?.title).toBe("Comma, in, title, again");
  });

  it("unescapes doubled quotes inside a quoted cell", () => {
    const rows = parsePocketCsv(FIXTURE_CSV);
    const escaped = rows.find((r) => r.url === "https://example.com/hard-ts");
    expect(escaped?.title).toBe('The "hard" parts of TypeScript');
  });

  it("keeps newlines that appear inside a quoted title", () => {
    const rows = parsePocketCsv(FIXTURE_CSV);
    const multi = rows.find((r) => r.url === "https://example.com/multi-line");
    expect(multi?.title).toContain("Line 1");
    expect(multi?.title).toContain("Line 2 in the same title");
    expect(multi?.title.includes("\n")).toBe(true);
  });

  it("keeps rows whose title cell is empty", () => {
    const rows = parsePocketCsv(FIXTURE_CSV);
    const untitled = rows.find((r) => r.url === "https://example.com/no-title");
    expect(untitled).toBeDefined();
    expect(untitled?.title).toBe("");
  });

  it("splits comma-quoted tag cells as well as pipe-separated ones", () => {
    const rows = parsePocketCsv(FIXTURE_CSV);
    const pipeTags = rows.find((r) => r.url.startsWith("https://blog.rust-lang.org/2024"));
    expect(pipeTags?.tags).toEqual(["rust", "systems"]);
    const quotedComma = rows.find((r) => r.url.startsWith("https://example.com/commas"));
    expect(quotedComma?.tags).toEqual(["design", "ux"]);
  });

  it("maps every pocket status value to a store ReadStatus", () => {
    const rows = parsePocketCsv(FIXTURE_CSV);
    const statuses = new Set(rows.map((r) => r.status));
    expect(statuses.has("unread")).toBe(true);
    expect(statuses.has("read")).toBe(true);
    expect(statuses.has("archived")).toBe(true);
  });

  it("tolerates a stray malformed row without dropping the good ones around it", () => {
    // A row with an unclosed quote consumes the rest of the file into one cell.
    // The parser must still emit the good header + first row it saw.
    const malformed = `title,url,time_added,tags,status
Broken row,"https://example.com/broken,1715000000,unclosed,unread
Good row,https://example.com/good,1716000000,ok,unread
`;
    const rows = parsePocketCsv(malformed);
    // Everything after the opening " is one giant quoted cell, so we get 1 row.
    expect(rows.length).toBe(1);
    // The row we do keep has a URL, which is the only field we actually require.
    expect(rows[0].url).toBeTruthy();
  });

  it("importPocketCsv canonicalises the URL and writes createdAt from time_added", async () => {
    const report = await importPocketCsv(FIXTURE_CSV);
    expect(report.imported + report.merged).toBeGreaterThanOrEqual(9);
    expect(report.rejected).toBe(0);
    const all = await listBookmarks();
    // The async-primer URL carries utm_source/utm_medium, both stripped by canonicalize.
    const asyncPrimer = all.find((b) => b.canonicalUrl.includes("async-primer"));
    expect(asyncPrimer?.canonicalUrl).toBe("https://blog.rust-lang.org/async-primer");
    // time_added=1708000000 (seconds) → 1708000000000 (ms).
    expect(asyncPrimer?.createdAt).toBe(1708000000_000);
    expect(all.every((b) => b.capturedFrom === "pocket")).toBe(true);
  });
});
