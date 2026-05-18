/**
 * Network-based meta fetcher. Downloads the page at the given URL, parses
 * HTML, and extracts a fixed set of meta tags + a word-count-based reading
 * time estimate.
 *
 * Strictly bounded: 15s timeout, 5 MB cap, HTML-only. Failures are typed,
 * not thrown — callers can decide whether to retry, back off, or skip.
 */

export type MetaResult =
  | {
      ok: true;
      title?: string;
      description?: string;
      ogType?: string;
      ogImage?: string;
      siteName?: string;
      author?: string;
      lang?: string;
      wordCount?: number;
      readingTimeMin?: number;
    }
  | {
      ok: false;
      reason: "network" | "non-html" | "too-large" | "parse-error" | "timeout";
    };

export const FETCH_TIMEOUT_MS = 15_000;
export const MAX_BYTES = 5 * 1024 * 1024;
export const WORDS_PER_MINUTE = 250;

const STRIP_SELECTOR = "script, style, nav, footer, aside, noscript, template, iframe";

export async function fetchAndParseMeta(url: string): Promise<MetaResult> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    if (isTimeoutError(err)) return { ok: false, reason: "timeout" };
    return { ok: false, reason: "network" };
  }

  if (!response.ok) return { ok: false, reason: "network" };

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("text/html")) {
    return { ok: false, reason: "non-html" };
  }

  const lenHeader = response.headers.get("content-length");
  if (lenHeader) {
    const len = Number.parseInt(lenHeader, 10);
    if (Number.isFinite(len) && len > MAX_BYTES) {
      return { ok: false, reason: "too-large" };
    }
  }

  let html: string;
  try {
    html = await response.text();
  } catch (err) {
    if (isTimeoutError(err)) return { ok: false, reason: "timeout" };
    return { ok: false, reason: "network" };
  }

  if (html.length > MAX_BYTES) return { ok: false, reason: "too-large" };

  return parseHtml(html);
}

function isTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = (err as { name?: string }).name;
  return name === "TimeoutError" || name === "AbortError";
}

export function parseHtml(html: string): MetaResult {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(html, "text/html");
  } catch {
    return { ok: false, reason: "parse-error" };
  }
  if (!doc?.documentElement) return { ok: false, reason: "parse-error" };

  const out: MetaResult & { ok: true } = { ok: true };

  const title = textOf(doc.querySelector("title"));
  if (title) out.title = title;

  const ogDesc = metaContent(doc, 'meta[property="og:description"]');
  const nameDesc = metaContent(doc, 'meta[name="description"]');
  const description = ogDesc || nameDesc;
  if (description) out.description = description;

  const ogType = metaContent(doc, 'meta[property="og:type"]');
  if (ogType) out.ogType = ogType;

  const ogImage = metaContent(doc, 'meta[property="og:image"]');
  if (ogImage) out.ogImage = ogImage;

  const siteName = metaContent(doc, 'meta[property="og:site_name"]');
  if (siteName) out.siteName = siteName;

  const author = metaContent(doc, 'meta[name="author"]');
  if (author) out.author = author;

  const lang = extractLang(doc);
  if (lang) out.lang = lang;

  const wordCount = bodyWordCount(doc);
  if (wordCount > 0) {
    out.wordCount = wordCount;
    out.readingTimeMin = Math.ceil(wordCount / WORDS_PER_MINUTE);
  }

  return out;
}

function textOf(el: Element | null): string {
  return (el?.textContent ?? "").trim();
}

function metaContent(doc: Document, selector: string): string {
  const el = doc.querySelector(selector);
  if (!el) return "";
  const content = el.getAttribute("content") ?? "";
  return content.trim();
}

function extractLang(doc: Document): string {
  const htmlLang = doc.documentElement?.getAttribute("lang") ?? "";
  if (htmlLang) return htmlLang.trim().toLowerCase();
  const equivEl = doc.querySelector('meta[http-equiv="content-language"]');
  const equiv = equivEl?.getAttribute("content") ?? "";
  if (equiv) return equiv.trim().toLowerCase();
  return "";
}

function bodyWordCount(doc: Document): number {
  const body = doc.body;
  if (!body) return 0;
  // Clone so we don't mutate the parsed doc — callers may want it later.
  const clone = body.cloneNode(true) as HTMLElement;
  for (const node of Array.from(clone.querySelectorAll(STRIP_SELECTOR))) {
    node.remove();
  }
  const text = (clone.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!text) return 0;
  return text.split(" ").filter(Boolean).length;
}
