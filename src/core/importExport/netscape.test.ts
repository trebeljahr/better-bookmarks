import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { upsertBookmark } from "../storage/bookmarks";
import { getDB, resetDBForTests } from "../storage/db";
import { exportNetscape } from "./netscape";

beforeEach(async () => {
  await getDB().bookmarks.clear();
});

afterEach(() => {
  resetDBForTests();
});

describe("exportNetscape", () => {
  it("emits the Netscape doctype header", async () => {
    const out = await exportNetscape();
    expect(out.startsWith("<!DOCTYPE NETSCAPE-Bookmark-file-1>")).toBe(true);
    expect(out).toContain('<META HTTP-EQUIV="Content-Type"');
    expect(out).toContain("<TITLE>Bookmarks</TITLE>");
    expect(out).toContain("<H1>Bookmarks</H1>");
  });

  it("renders each tag as an H3 folder and re-lists multi-tag bookmarks under each folder", async () => {
    await upsertBookmark({
      rawUrl: "https://example.com/a",
      title: "A",
      tags: ["alpha", "beta"],
    });
    const out = await exportNetscape();
    expect(out).toContain("<H3>alpha</H3>");
    expect(out).toContain("<H3>beta</H3>");
    const occurrences = out.split('HREF="https://example.com/a"').length - 1;
    expect(occurrences).toBe(2);
  });

  it("puts untagged bookmarks under the 'Better Bookmarks' folder", async () => {
    await upsertBookmark({ rawUrl: "https://example.com/u", title: "U" });
    const out = await exportNetscape();
    expect(out).toContain("<H3>Better Bookmarks</H3>");
    expect(out).toContain('HREF="https://example.com/u"');
  });

  it('HTML-escapes <, >, &, and " in titles', async () => {
    await upsertBookmark({
      rawUrl: "https://example.com/esc",
      title: 'Cats & Dogs <are> "great"',
    });
    const out = await exportNetscape();
    expect(out).toContain("Cats &amp; Dogs &lt;are&gt; &quot;great&quot;");
    expect(out).not.toContain("Cats & Dogs <are>");
  });

  it("emits ADD_DATE in seconds, not milliseconds", async () => {
    const r = await upsertBookmark({ rawUrl: "https://example.com/t", title: "T" });
    if (!r.ok) throw new Error("seed failed");
    const expectedSec = Math.floor(r.bookmark.createdAt / 1000);
    const out = await exportNetscape();
    expect(out).toContain(`ADD_DATE="${expectedSec}"`);
    expect(out).not.toContain(`ADD_DATE="${r.bookmark.createdAt}"`);
  });

  it("uses originalUrl, not canonicalUrl, for HREF", async () => {
    const raw = "https://example.com/x?utm_source=newsletter";
    const r = await upsertBookmark({ rawUrl: raw, title: "X" });
    if (!r.ok) throw new Error("seed failed");
    expect(r.bookmark.originalUrl).toBe(raw);
    expect(r.bookmark.canonicalUrl).not.toBe(raw);

    const out = await exportNetscape();
    expect(out).toContain(`HREF="${raw}"`);
  });

  it("emits balanced DL blocks", async () => {
    await upsertBookmark({ rawUrl: "https://example.com/a", title: "A", tags: ["t1"] });
    await upsertBookmark({ rawUrl: "https://example.com/b", title: "B" });
    const out = await exportNetscape();
    const openCount = (out.match(/<DL><p>/g) ?? []).length;
    const closeCount = (out.match(/<\/DL><p>/g) ?? []).length;
    expect(openCount).toBe(closeCount);
    expect(openCount).toBeGreaterThanOrEqual(3); // root + tag folder + untagged folder
  });
});
