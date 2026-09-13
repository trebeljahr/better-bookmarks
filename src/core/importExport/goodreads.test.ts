// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { countBookmarks, listBookmarks, upsertBookmark } from "../storage/bookmarks";
import { getDB, resetDBForTests } from "../storage/db";
import { importGoodreadsHtml, parseGoodreadsHtml } from "./goodreads";

beforeEach(async () => {
  await getDB().bookmarks.clear();
});

afterEach(() => {
  resetDBForTests();
});

const SAMPLE_LIBRARY_PATH = resolve(__dirname, "../../test/fixtures/goodreads-sample.html");
const SAMPLE_LIBRARY = readFileSync(SAMPLE_LIBRARY_PATH, "utf8");

// ---- HTML table format (real Goodreads library export) -------------------

describe("parseGoodreadsHtml (HTML table export)", () => {
  it("parses one entry per book row", () => {
    const entries = parseGoodreadsHtml(SAMPLE_LIBRARY);
    expect(entries).toHaveLength(10);
  });

  it("resolves the book URL against goodreads.com and drops query strings", () => {
    const entries = parseGoodreadsHtml(SAMPLE_LIBRARY);
    const sapiens = entries.find((e) => e.title.includes("Sapiens"));
    expect(sapiens?.url).toBe("https://www.goodreads.com/book/show/23692271-sapiens");
    // Also accepts absolute anchor hrefs without duplicating the origin.
    const catcher = entries.find((e) => e.title.includes("Catcher"));
    expect(catcher?.url).toBe("https://www.goodreads.com/book/show/5107.The_Catcher_in_the_Rye");
  });

  it("prefers the anchor title attribute for the full book name", () => {
    const entries = parseGoodreadsHtml(SAMPLE_LIBRARY);
    const gameOfThrones = entries.find((e) => /Game of Thrones/i.test(e.title));
    expect(gameOfThrones?.title).toBe("A Game of Thrones (A Song of Ice and Fire, #1)");
  });

  it("maps 1-5 filled p10 stars onto the 0-10 rating scale (star*2)", () => {
    const entries = parseGoodreadsHtml(SAMPLE_LIBRARY);
    const pick = (needle: RegExp) => entries.find((e) => needle.test(e.title));
    expect(pick(/Game of Thrones/)?.rating).toBe(10); // 5 stars
    expect(pick(/^Harry Potter/)?.rating).toBe(8); // 4 stars
    expect(pick(/^Atomic Habits/)?.rating).toBe(6); // 3 stars
    expect(pick(/^The Catcher in the Rye/)?.rating).toBe(4); // 2 stars
    expect(pick(/^The Name of the Wind/)?.rating).toBe(2); // 1 star
    expect(pick(/^The Stand$/)?.rating).toBeNull(); // 0 stars = unrated
  });

  it("splits shelves into tags in the order they appear", () => {
    const entries = parseGoodreadsHtml(SAMPLE_LIBRARY);
    const got = entries.find((e) => e.title.startsWith("A Game of Thrones"));
    expect(got?.tags).toEqual(["read", "fantasy", "favorites"]);
  });

  it("comma-splits plain-text shelves when the cell has no anchors", () => {
    const entries = parseGoodreadsHtml(SAMPLE_LIBRARY);
    const stand = entries.find((e) => e.title === "The Stand");
    expect(stand?.tags).toEqual(["to-read", "horror", "epic"]);
  });

  it("captures the user review as the note when present", () => {
    const entries = parseGoodreadsHtml(SAMPLE_LIBRARY);
    const orwell = entries.find((e) => e.title === "1984");
    expect(orwell?.note).toBe("The appendix on Newspeak is the point.");
  });

  it("prefers the full 'freeTextContainer' body over the truncated snippet", () => {
    const entries = parseGoodreadsHtml(SAMPLE_LIBRARY);
    const sapiens = entries.find((e) => e.title.includes("Sapiens"));
    expect(sapiens?.note).toBe(
      "Big claims, big pictures. Read chapter one twice, then the last chapter, then work backwards through the middle.",
    );
  });

  it("returns null for an empty review cell", () => {
    const entries = parseGoodreadsHtml(SAMPLE_LIBRARY);
    const hp = entries.find((e) => e.title.startsWith("Harry Potter"));
    expect(hp?.note).toBeNull();
  });

  it("decodes html entities in titles", () => {
    const entries = parseGoodreadsHtml(SAMPLE_LIBRARY);
    const hp = entries.find((e) => e.title.startsWith("Harry Potter"));
    expect(hp?.title).toBe("Harry Potter and the Sorcerer's Stone");
  });

  it("dedupes rows that point at the same book path", () => {
    const dup = `<table>
      <tbody>
        <tr><td class="field title"><a href="/book/show/1.A">A</a></td></tr>
        <tr><td class="field title"><a href="/book/show/1.A?ref=nav">A</a></td></tr>
      </tbody>
    </table>`;
    const entries = parseGoodreadsHtml(dup);
    expect(entries).toHaveLength(1);
  });

  it("skips rows without a /book/show/ anchor", () => {
    const junk = `<table>
      <tbody>
        <tr><td>header</td></tr>
        <tr><td><a href="/user/show/1">A user link</a></td></tr>
      </tbody>
    </table>`;
    const entries = parseGoodreadsHtml(junk);
    expect(entries).toHaveLength(0);
  });
});

describe("importGoodreadsHtml (HTML table export)", () => {
  it("imports every row as a book bookmark tagged with its shelves", async () => {
    const report = await importGoodreadsHtml(SAMPLE_LIBRARY);
    expect(report).toEqual({ imported: 10, merged: 0, rejected: 0 });
    const all = await listBookmarks();
    expect(all).toHaveLength(10);
    expect(all.every((b) => b.contentType === "book")).toBe(true);
    expect(all.every((b) => b.capturedFrom === "goodreads")).toBe(true);
    const orwell = all.find((b) => b.title === "1984");
    expect(orwell?.tags).toEqual(["classics", "dystopia", "favorites", "read"]);
    expect(orwell?.rating).toBe(10);
    expect(orwell?.note).toBe("The appendix on Newspeak is the point.");
  });

  it("dedupes against an existing bookmark and merges shelves in", async () => {
    await upsertBookmark({
      rawUrl: "https://www.goodreads.com/book/show/40961427-atomic-habits",
      title: "Pre-existing",
      tags: ["habit-book"],
    });
    const report = await importGoodreadsHtml(SAMPLE_LIBRARY);
    expect(report.merged).toBe(1);
    expect(report.imported).toBe(9);
    expect(await countBookmarks()).toBe(10);
    const all = await listBookmarks();
    const merged = all.find((b) => b.canonicalUrl.includes("40961427-atomic-habits"));
    expect(merged?.tags).toContain("habit-book");
    expect(merged?.tags).toContain("productivity");
    expect(merged?.rating).toBe(6);
    expect(merged?.note).toBe("Practical. Two chapters do the heavy lifting; the rest reinforces.");
  });
});

// ---- NETSCAPE fallback (legacy DL/DT format) -----------------------------

const SINGLE_SHELF = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3>To Read</H3>
    <DL><p>
        <DT><A HREF="https://www.goodreads.com/book/show/1.Atomic_Habits">Atomic Habits by James Clear</A>
        <DT><A HREF="https://www.goodreads.com/book/show/2.Deep_Work">Deep Work by Cal Newport</A>
    </DL><p>
</DL><p>`;

const MULTI_SHELF = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
    <DT><H3>Read</H3>
    <DL><p>
        <DT><A HREF="https://www.goodreads.com/book/show/10.Sapiens">Sapiens by Yuval Harari</A>
    </DL><p>
    <DT><H3>To Read</H3>
    <DL><p>
        <DT><A HREF="https://www.goodreads.com/book/show/11.Atomic">Atomic Habits by James Clear</A>
    </DL><p>
</DL><p>`;

const WITH_RATING = `<DL><p>
    <DT><H3>Top</H3>
    <DL><p>
        <DT><A HREF="https://www.goodreads.com/book/show/100">Antifragile (5/5)</A>
        <DT><A HREF="https://www.goodreads.com/book/show/101">Flow &#9733;&#9733;&#9733;&#9733;</A>
        <DT><A HREF="https://www.goodreads.com/book/show/102">Chaos by Gleick</A>
        <DD>4 stars
    </DL><p>
</DL><p>`;

const WITH_ENTITIES = `<DL><p>
    <DT><H3>Read &amp; Loved</H3>
    <DL><p>
        <DT><A HREF="https://www.goodreads.com/book/show/200">Why We Sleep &amp; Dream</A>
    </DL><p>
</DL><p>`;

const WITH_TRACKING = `<DL><p>
    <DT><H3>Shelf</H3>
    <DL><p>
        <DT><A HREF="https://www.goodreads.com/book/show/300?utm_source=email&from_search=true">Book</A>
    </DL><p>
</DL><p>`;

describe("parseGoodreadsHtml (NETSCAPE fallback)", () => {
  it("parses entries with shelf as tag", () => {
    const entries = parseGoodreadsHtml(SINGLE_SHELF);
    expect(entries).toHaveLength(2);
    expect(entries[0].title).toBe("Atomic Habits by James Clear");
    expect(entries[0].tags).toEqual(["To Read"]);
    expect(entries[1].url).toBe("https://www.goodreads.com/book/show/2.Deep_Work");
  });

  it("separates multiple shelves into distinct tag sets", () => {
    const entries = parseGoodreadsHtml(MULTI_SHELF);
    expect(entries).toHaveLength(2);
    expect(entries[0].tags).toEqual(["Read"]);
    expect(entries[1].tags).toEqual(["To Read"]);
  });

  it("extracts rating from title (N/5)", () => {
    const entries = parseGoodreadsHtml(WITH_RATING);
    expect(entries[0].title).toBe("Antifragile");
    expect(entries[0].rating).toBe(10);
  });

  it("extracts rating from star unicode", () => {
    const entries = parseGoodreadsHtml(WITH_RATING);
    expect(entries[1].title).toBe("Flow");
    expect(entries[1].rating).toBe(8);
  });

  it("extracts rating from <DD> sibling", () => {
    const entries = parseGoodreadsHtml(WITH_RATING);
    expect(entries[2].rating).toBe(8);
  });

  it("decodes HTML entities in titles and shelves", () => {
    const entries = parseGoodreadsHtml(WITH_ENTITIES);
    expect(entries[0].title).toBe("Why We Sleep & Dream");
    expect(entries[0].tags).toEqual(["Read & Loved"]);
  });
});

describe("importGoodreadsHtml (NETSCAPE fallback)", () => {
  it("inserts entries with contentType=book and capturedFrom=goodreads", async () => {
    const report = await importGoodreadsHtml(SINGLE_SHELF);
    expect(report).toEqual({ imported: 2, merged: 0, rejected: 0 });
    const all = await listBookmarks();
    expect(all).toHaveLength(2);
    expect(all.every((b) => b.contentType === "book")).toBe(true);
    expect(all.every((b) => b.capturedFrom === "goodreads")).toBe(true);
  });

  it("canonicalizes urls on import (strips tracking)", async () => {
    await importGoodreadsHtml(WITH_TRACKING);
    const all = await listBookmarks();
    expect(all).toHaveLength(1);
    expect(all[0].canonicalUrl).not.toContain("utm_source");
    expect(all[0].canonicalUrl).toContain("from_search=true");
  });

  it("dedupes against existing bookmark via canonicalize", async () => {
    await upsertBookmark({
      rawUrl: "https://www.goodreads.com/book/show/1.Atomic_Habits",
      title: "Pre-existing",
      tags: ["seed"],
    });
    const report = await importGoodreadsHtml(SINGLE_SHELF);
    expect(report.merged).toBe(1);
    expect(report.imported).toBe(1);
    expect(await countBookmarks()).toBe(2);
    const merged = (await listBookmarks()).find((b) => b.canonicalUrl.endsWith("1.Atomic_Habits"));
    expect(merged?.tags).toContain("seed");
    expect(merged?.tags).toContain("To Read");
  });
});
