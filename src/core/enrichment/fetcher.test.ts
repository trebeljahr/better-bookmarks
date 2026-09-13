// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAndParseMeta, parseHtml } from "./fetcher";

function mockFetch(response: Partial<Response> & { body?: string }): void {
  const headers = new Headers(response.headers ?? {});
  // biome-ignore lint/suspicious/noExplicitAny: test mock
  (globalThis as any).fetch = vi.fn(async () => {
    const text = response.body ?? "";
    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      headers,
      text: async () => text,
    } as unknown as Response;
  });
}

function mockFetchThrowing(err: Error): void {
  // biome-ignore lint/suspicious/noExplicitAny: test mock
  (globalThis as any).fetch = vi.fn(async () => {
    throw err;
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  // biome-ignore lint/suspicious/noExplicitAny: test cleanup
  delete (globalThis as any).fetch;
});

describe("fetchAndParseMeta", () => {
  it("extracts title, og:* tags, author, and lang on a well-formed page", async () => {
    mockFetch({
      ok: true,
      headers: { "content-type": "text/html; charset=utf-8" },
      body: `<!doctype html>
<html lang="en-US">
  <head>
    <title>Hello world</title>
    <meta name="description" content="meta desc">
    <meta property="og:description" content="og desc">
    <meta property="og:type" content="article">
    <meta property="og:image" content="https://example.com/img.png">
    <meta property="og:site_name" content="Example Site">
    <meta name="author" content="Jane Doe">
  </head>
  <body><p>One two three four five.</p></body>
</html>`,
    });
    const result = await fetchAndParseMeta("https://example.com/post");
    if (!result.ok) throw new Error(`expected ok, got reason=${result.reason}`);
    expect(result.title).toBe("Hello world");
    expect(result.description).toBe("og desc");
    expect(result.ogType).toBe("article");
    expect(result.ogImage).toBe("https://example.com/img.png");
    expect(result.siteName).toBe("Example Site");
    expect(result.author).toBe("Jane Doe");
    expect(result.lang).toBe("en");
    expect(result.wordCount).toBe(5);
    expect(result.readingTimeMin).toBe(1);
  });

  it("falls back to name=description when og:description missing", async () => {
    mockFetch({
      ok: true,
      headers: { "content-type": "text/html" },
      body: `<html><head><meta name="description" content="fallback desc"></head><body></body></html>`,
    });
    const result = await fetchAndParseMeta("https://example.com");
    if (!result.ok) throw new Error("expected ok");
    expect(result.description).toBe("fallback desc");
  });

  it("og:description wins over name=description when both present", async () => {
    mockFetch({
      ok: true,
      headers: { "content-type": "text/html" },
      body: `<html><head>
        <meta name="description" content="from name">
        <meta property="og:description" content="from og">
      </head><body></body></html>`,
    });
    const result = await fetchAndParseMeta("https://example.com");
    if (!result.ok) throw new Error("expected ok");
    expect(result.description).toBe("from og");
  });

  it("returns non-html when content-type is JSON", async () => {
    mockFetch({
      ok: true,
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const result = await fetchAndParseMeta("https://example.com/api");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected fail");
    expect(result.reason).toBe("non-html");
  });

  it("returns network when response is not ok (404)", async () => {
    mockFetch({
      ok: false,
      status: 404,
      headers: { "content-type": "text/html" },
      body: "",
    });
    const result = await fetchAndParseMeta("https://example.com/missing");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected fail");
    expect(result.reason).toBe("network");
  });

  it("returns timeout when fetch throws TimeoutError", async () => {
    const err = new Error("aborted");
    err.name = "TimeoutError";
    mockFetchThrowing(err);
    const result = await fetchAndParseMeta("https://example.com/slow");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected fail");
    expect(result.reason).toBe("timeout");
  });

  it("returns network when fetch throws generic error", async () => {
    mockFetchThrowing(new Error("dns"));
    const result = await fetchAndParseMeta("https://no-such-domain.invalid");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected fail");
    expect(result.reason).toBe("network");
  });

  it("returns too-large when content-length exceeds cap", async () => {
    mockFetch({
      ok: true,
      headers: {
        "content-type": "text/html",
        "content-length": String(10 * 1024 * 1024),
      },
      body: "",
    });
    const result = await fetchAndParseMeta("https://example.com/huge");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected fail");
    expect(result.reason).toBe("too-large");
  });

  it("strips script/style/nav/footer/aside before counting words", async () => {
    mockFetch({
      ok: true,
      headers: { "content-type": "text/html" },
      body: `<html><body>
        <script>alert('boom this should not count')</script>
        <style>body{} more should not count</style>
        <nav>nav nav nav nav nav</nav>
        <footer>footer footer footer</footer>
        <aside>aside aside aside</aside>
        <p>real content word</p>
      </body></html>`,
    });
    const result = await fetchAndParseMeta("https://example.com");
    if (!result.ok) throw new Error("expected ok");
    expect(result.wordCount).toBe(3);
  });
});

describe("parseHtml", () => {
  it("computes readingTimeMin as ceil(words/250)", () => {
    const words = Array.from({ length: 300 }, (_, i) => `w${i}`).join(" ");
    const result = parseHtml(`<html><body><p>${words}</p></body></html>`);
    if (!result.ok) throw new Error("expected ok");
    expect(result.wordCount).toBe(300);
    expect(result.readingTimeMin).toBe(2);
  });

  it("extracts lang from meta http-equiv when html lang missing", () => {
    const result = parseHtml(
      `<html><head><meta http-equiv="content-language" content="DE"></head><body></body></html>`,
    );
    if (!result.ok) throw new Error("expected ok");
    expect(result.lang).toBe("de");
  });

  it("falls back to trigram detection on title+description when no lang declared", () => {
    const result = parseHtml(
      `<html><head>
        <title>Der schnelle braune Fuchs</title>
        <meta property="og:description" content="springt über den faulen Hund und läuft weiter durch den Wald">
      </head><body></body></html>`,
    );
    if (!result.ok) throw new Error("expected ok");
    expect(result.lang).toBe("de");
  });

  it("leaves lang unset when no declaration and detection sample too short", () => {
    const result = parseHtml(
      `<html><head><title>Hi</title></head><body></body></html>`,
    );
    if (!result.ok) throw new Error("expected ok");
    expect(result.lang).toBeUndefined();
  });
});
