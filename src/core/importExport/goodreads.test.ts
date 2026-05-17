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
        <DT><A HREF="https://www.goodreads.com/book/show/101">Flow ★★★★</A>
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

describe("parseGoodreadsHtml", () => {
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

describe("importGoodreadsHtml", () => {
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
