import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listBookmarks } from "../storage/bookmarks";
import { getDB, resetDBForTests } from "../storage/db";
import { importPocketCsv, parsePocketCsv } from "./pocket";

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
