import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Bookmark } from "../../shared/types";
import { getBookmarkById, upsertBookmark } from "../storage/bookmarks";
import { getDB, resetDBForTests } from "../storage/db";
import { enrichBookmark, mapOgTypeToContentType } from "./enrich";
import type { MetaResult } from "./fetcher";

async function seed(opts: { rawUrl: string; title?: string }): Promise<Bookmark> {
  const r = await upsertBookmark({
    rawUrl: opts.rawUrl,
    title: opts.title,
  });
  if (!r.ok) throw new Error("seed failed");
  return r.bookmark;
}

function fetcherReturning(meta: MetaResult) {
  return async () => meta;
}

beforeEach(async () => {
  await getDB().bookmarks.clear();
});

afterEach(() => {
  resetDBForTests();
});

describe("mapOgTypeToContentType", () => {
  it("maps article-family og types to article", () => {
    expect(mapOgTypeToContentType("article")).toBe("article");
    expect(mapOgTypeToContentType("news_article")).toBe("article");
    expect(mapOgTypeToContentType("blog.post")).toBe("article");
  });

  it("maps video-family og types to video", () => {
    expect(mapOgTypeToContentType("video")).toBe("video");
    expect(mapOgTypeToContentType("video.movie")).toBe("video");
    expect(mapOgTypeToContentType("video.episode")).toBe("video");
  });

  it("maps book og type to book", () => {
    expect(mapOgTypeToContentType("book")).toBe("book");
    expect(mapOgTypeToContentType("books.book")).toBe("book");
  });

  it("maps podcast/music og types to podcast", () => {
    expect(mapOgTypeToContentType("podcast")).toBe("podcast");
    expect(mapOgTypeToContentType("music.song")).toBe("podcast");
  });

  it("returns null for unknown og type", () => {
    expect(mapOgTypeToContentType("frobnitz")).toBeNull();
    expect(mapOgTypeToContentType(undefined)).toBeNull();
    expect(mapOgTypeToContentType("")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(mapOgTypeToContentType("ARTICLE")).toBe("article");
    expect(mapOgTypeToContentType("  Article  ")).toBe("article");
  });
});

describe("enrichBookmark", () => {
  it("fills empty title with fetched title", async () => {
    const bm = await seed({ rawUrl: "https://example.com/post" });
    expect(bm.title).toBe("");
    const res = await enrichBookmark(bm, {
      fetcher: fetcherReturning({ ok: true, title: "Fetched Title" }),
    });
    expect(res.updated).toBe(true);
    const updated = await getBookmarkById(bm.id);
    expect(updated?.title).toBe("Fetched Title");
    expect(typeof updated?.enrichedAt).toBe("number");
  });

  it("preserves a user-supplied title", async () => {
    const bm = await seed({ rawUrl: "https://example.com/post", title: "User Title" });
    await enrichBookmark(bm, {
      fetcher: fetcherReturning({ ok: true, title: "Fetched Title" }),
    });
    const updated = await getBookmarkById(bm.id);
    expect(updated?.title).toBe("User Title");
  });

  it("overwrites title when current title equals the original URL", async () => {
    const bm = await seed({
      rawUrl: "https://example.com/post",
      title: "https://example.com/post",
    });
    await enrichBookmark(bm, {
      fetcher: fetcherReturning({ ok: true, title: "Real Title" }),
    });
    const updated = await getBookmarkById(bm.id);
    expect(updated?.title).toBe("Real Title");
  });

  it("only fills description when empty", async () => {
    const bm = await seed({ rawUrl: "https://example.com/a" });
    await enrichBookmark(bm, {
      fetcher: fetcherReturning({ ok: true, description: "from net" }),
    });
    const updated = await getBookmarkById(bm.id);
    expect(updated?.description).toBe("from net");
  });

  it("fills language only when null", async () => {
    const bm = await seed({ rawUrl: "https://example.com/lang" });
    await enrichBookmark(bm, {
      fetcher: fetcherReturning({ ok: true, lang: "fr" }),
    });
    const updated = await getBookmarkById(bm.id);
    expect(updated?.language).toBe("fr");
  });

  it("fills necessaryTime only when null", async () => {
    const bm = await seed({ rawUrl: "https://example.com/long" });
    await enrichBookmark(bm, {
      fetcher: fetcherReturning({ ok: true, readingTimeMin: 12, wordCount: 3000 }),
    });
    const updated = await getBookmarkById(bm.id);
    expect(updated?.necessaryTime).toBe(12);
  });

  it("maps og:type=article to contentType article when previously unknown", async () => {
    const bm = await seed({ rawUrl: "https://example.com/x" });
    await enrichBookmark(bm, {
      fetcher: fetcherReturning({ ok: true, ogType: "article" }),
    });
    const updated = await getBookmarkById(bm.id);
    expect(updated?.contentType).toBe("article");
  });

  it("maps og:type=video to contentType video", async () => {
    const bm = await seed({ rawUrl: "https://example.com/v" });
    await enrichBookmark(bm, {
      fetcher: fetcherReturning({ ok: true, ogType: "video.movie" }),
    });
    const updated = await getBookmarkById(bm.id);
    expect(updated?.contentType).toBe("video");
  });

  it("maps og:type=book to contentType book", async () => {
    const bm = await seed({ rawUrl: "https://example.com/b" });
    await enrichBookmark(bm, {
      fetcher: fetcherReturning({ ok: true, ogType: "book" }),
    });
    const updated = await getBookmarkById(bm.id);
    expect(updated?.contentType).toBe("book");
  });

  it("maps og:type=podcast to contentType podcast", async () => {
    const bm = await seed({ rawUrl: "https://example.com/p" });
    await enrichBookmark(bm, {
      fetcher: fetcherReturning({ ok: true, ogType: "podcast" }),
    });
    const updated = await getBookmarkById(bm.id);
    expect(updated?.contentType).toBe("podcast");
  });

  it("leaves contentType untouched when already classified", async () => {
    const bm = await seed({ rawUrl: "https://example.com/c" });
    await getDB().bookmarks.update(bm.id, { contentType: "paper" });
    const reloaded = (await getBookmarkById(bm.id)) as Bookmark;
    await enrichBookmark(reloaded, {
      fetcher: fetcherReturning({ ok: true, ogType: "article" }),
    });
    const updated = await getBookmarkById(bm.id);
    expect(updated?.contentType).toBe("paper");
  });

  it("upsertBookmark seeds contentType from URL patterns", async () => {
    const bm = await seed({ rawUrl: "https://github.com/octocat/hello-world" });
    expect(bm.contentType).toBe("repo");
  });

  it("og:type overrides the URL-pattern guess when the guess is still in place", async () => {
    // Fresh bookmark on a URL the offline heuristic classes as "repo".
    // Live fetch reveals og:type=article — that must win over the URL
    // guess so we don't leave a wrong label behind after network enrichment.
    const bm = await seed({ rawUrl: "https://github.com/octocat/hello-world" });
    expect(bm.contentType).toBe("repo");
    await enrichBookmark(bm, {
      fetcher: fetcherReturning({ ok: true, ogType: "article" }),
    });
    const updated = await getBookmarkById(bm.id);
    expect(updated?.contentType).toBe("article");
  });

  it("preserves a user-set contentType even when og:type disagrees with the URL guess", async () => {
    // URL guess says "repo", user manually curated as "book", og:type
    // says "article". The user's choice must survive; og:type is not
    // allowed to overwrite deliberate curation.
    const bm = await seed({ rawUrl: "https://github.com/octocat/hello-world" });
    await getDB().bookmarks.update(bm.id, { contentType: "book" });
    const reloaded = (await getBookmarkById(bm.id)) as Bookmark;
    await enrichBookmark(reloaded, {
      fetcher: fetcherReturning({ ok: true, ogType: "article" }),
    });
    const updated = await getBookmarkById(bm.id);
    expect(updated?.contentType).toBe("book");
  });

  it("records enrichedAt on failure but reports updated:false with reason", async () => {
    const bm = await seed({ rawUrl: "https://example.com/d" });
    const res = await enrichBookmark(bm, {
      fetcher: fetcherReturning({ ok: false, reason: "non-html" }),
      now: 12345,
    });
    expect(res).toEqual({ updated: false, reason: "non-html" });
    const updated = await getBookmarkById(bm.id);
    expect(updated?.enrichedAt).toBe(12345);
    expect(updated?.title).toBe("");
  });

  it("reports updated:false when meta has no fillable fields", async () => {
    const bm = await seed({
      rawUrl: "https://example.com/e",
      title: "Already Set",
    });
    await getDB().bookmarks.update(bm.id, {
      description: "preset",
      language: "en",
      necessaryTime: 5,
      contentType: "article",
    });
    const reloaded = (await getBookmarkById(bm.id)) as Bookmark;
    const res = await enrichBookmark(reloaded, {
      fetcher: fetcherReturning({
        ok: true,
        title: "x",
        description: "y",
        lang: "fr",
        ogType: "video",
        readingTimeMin: 99,
      }),
    });
    expect(res.updated).toBe(false);
    const final = await getBookmarkById(bm.id);
    expect(final?.title).toBe("Already Set");
    expect(final?.description).toBe("preset");
    expect(final?.language).toBe("en");
    expect(final?.necessaryTime).toBe(5);
    expect(final?.contentType).toBe("article");
    expect(typeof final?.enrichedAt).toBe("number");
  });
});
