/**
 * Goodreads library HTML import.
 *
 * Goodreads renders "My Books" as an HTML <table> — one <tr> per book with
 * .field.title / .field.rating / .field.shelves / .field.review cells. Users
 * can save that page from their browser and hand the file to us here.
 *
 * We also keep a fallback for the legacy NETSCAPE bookmark file (DL/DT), so
 * older exports and users who curated their Goodreads library into a
 * bookmark file still round-trip through the same button.
 *
 * Row mapping (canonical HTML-table path):
 *   title  = the anchor text of the `/book/show/<id>` link
 *   url    = the book's Goodreads page (https://www.goodreads.com/book/show/<id>)
 *   rating = 1-5 stars → 2-10 on our 0-10 scale (star * 2)
 *   tags   = comma-split shelves (each shelf is either an <a> or a plain span)
 *   note   = the user's review text, when present
 */

import { upsertBookmark } from "../storage/bookmarks";
import type { BasicImportReport } from "./index";

export type ParsedGoodreadsEntry = {
  url: string;
  title: string;
  tags: string[];
  rating: number | null;
  note: string | null;
};

export function parseGoodreadsHtml(html: string): ParsedGoodreadsEntry[] {
  const tableEntries = parseGoodreadsTable(html);
  if (tableEntries.length > 0) return tableEntries;
  return parseGoodreadsNetscape(html);
}

export async function importGoodreadsHtml(html: string): Promise<BasicImportReport> {
  const entries = parseGoodreadsHtml(html);
  const report: BasicImportReport = { imported: 0, merged: 0, rejected: 0 };
  for (const entry of entries) {
    const result = await upsertBookmark({
      rawUrl: entry.url,
      title: entry.title,
      tags: entry.tags,
      rating: entry.rating,
      note: entry.note ?? undefined,
      contentType: "book",
      capturedFrom: "goodreads",
    });
    if (!result.ok) {
      report.rejected += 1;
      continue;
    }
    if (result.created) report.imported += 1;
    else report.merged += 1;
  }
  return report;
}

// ---------- HTML table parser (real Goodreads library export) ----------

const GOODREADS_ORIGIN = "https://www.goodreads.com";
const BOOK_SHOW_PATH_RE = /^\/?book\/show\/[^?#]+/i;

function parseGoodreadsTable(html: string): ParsedGoodreadsEntry[] {
  if (typeof DOMParser === "undefined") return [];
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(html, "text/html");
  } catch {
    return [];
  }
  if (!doc?.documentElement) return [];

  const rows = Array.from(doc.querySelectorAll("tr"));
  const seen = new Set<string>();
  const out: ParsedGoodreadsEntry[] = [];
  for (const row of rows) {
    const entry = parseGoodreadsRow(row);
    if (!entry) continue;
    if (seen.has(entry.url)) continue;
    seen.add(entry.url);
    out.push(entry);
  }
  return out;
}

function parseGoodreadsRow(row: Element): ParsedGoodreadsEntry | null {
  const anchor = row.querySelector<HTMLAnchorElement>('a[href*="/book/show/"]');
  if (!anchor) return null;
  const href = (anchor.getAttribute("href") ?? "").trim();
  if (!href) return null;
  const path = extractBookShowPath(href);
  if (!path) return null;
  const url = new URL(path, GOODREADS_ORIGIN).toString();

  // Prefer the anchor's `title` attribute (Goodreads uses it for the full
  // book name and drops the abbreviated variant into the visible text). Fall
  // back to text content.
  const titleAttr = (anchor.getAttribute("title") ?? "").trim();
  const titleText = normalizeWhitespace(anchor.textContent ?? "");
  const title = titleAttr || titleText;
  if (!title) return null;

  return {
    url,
    title,
    tags: extractRowShelves(row),
    rating: extractRowRating(row),
    note: extractRowReview(row),
  };
}

function extractBookShowPath(href: string): string | null {
  // href can be a relative path ("/book/show/12345.Title"), an absolute URL,
  // or absolute-with-tracking. Strip the query/fragment and normalise to the
  // canonical /book/show/<id> path — the canonicaliser downstream tightens
  // further, but we hand it a clean input.
  let candidate = href;
  try {
    if (/^https?:\/\//i.test(href)) {
      const u = new URL(href);
      candidate = u.pathname;
    }
  } catch {
    // fall through and try the raw href
  }
  const m = candidate.match(BOOK_SHOW_PATH_RE);
  if (!m) return null;
  return m[0].startsWith("/") ? m[0] : `/${m[0]}`;
}

function extractRowRating(row: Element): number | null {
  const stars = row.querySelector(".staticStars");
  if (stars) {
    // Prefer explicit filled-star markers. Goodreads renders each star as a
    // <span class="staticStar p10"> (filled) or <span class="staticStar p0">
    // (empty); we count the p10s.
    const filled = stars.querySelectorAll(".staticStar.p10").length;
    if (filled > 0) return clampRating(filled * 2);
    const titleAttr = stars.getAttribute("title") ?? "";
    const mapped = starsFromReviewText(titleAttr);
    if (mapped !== null) return mapped;
  }
  const cell = getFieldCell(row, "rating");
  if (cell) {
    const text = normalizeWhitespace(cell.textContent ?? "").replace(/^my rating\s*/i, "");
    const mapped = starsFromReviewText(text);
    if (mapped !== null) return mapped;
    const num = text.match(/(\d+(?:\.\d+)?)\s*(?:of\s*5|\/\s*5|stars?)/i);
    if (num) {
      const value = Number.parseFloat(num[1]);
      if (Number.isFinite(value)) return clampRating(value * 2);
    }
  }
  return null;
}

const REVIEW_PHRASES: ReadonlyArray<[RegExp, number]> = [
  [/it was amazing/i, 10],
  [/really liked it/i, 8],
  [/liked it/i, 6],
  [/it was ok/i, 4],
  [/did not like it/i, 2],
];

function starsFromReviewText(text: string): number | null {
  for (const [re, value] of REVIEW_PHRASES) if (re.test(text)) return value;
  return null;
}

function clampRating(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(10, Math.round(value)));
}

function extractRowShelves(row: Element): string[] {
  const cell = getFieldCell(row, "shelves");
  if (!cell) return [];
  const valueEl = cell.querySelector(".value") ?? cell;
  const anchors = valueEl.querySelectorAll<HTMLAnchorElement>("a");
  const raw =
    anchors.length > 0
      ? Array.from(anchors).map((a) => normalizeWhitespace(a.textContent ?? ""))
      : normalizeWhitespace(valueEl.textContent ?? "")
          .replace(/^shelves\s*/i, "")
          .split(",");
  return dedupNonEmpty(raw);
}

function extractRowReview(row: Element): string | null {
  const cell = getFieldCell(row, "review");
  if (!cell) return null;
  // Goodreads truncates long reviews with a "…more" toggle; the full text
  // sits in a sibling <span id="freeTextContainer<id>">. Prefer that when
  // present, else take the visible snippet span, else the raw cell text.
  const full = cell.querySelector('[id^="freeTextContainer"]');
  const snippet = cell.querySelector('[id^="freeText"]:not([id^="freeTextContainer"])');
  const source = full ?? snippet ?? cell.querySelector(".value") ?? cell;
  let text = normalizeWhitespace(source.textContent ?? "");
  text = text.replace(/^review\s*/i, "");
  text = text.replace(/\s*\(less\)$/i, "");
  text = text.replace(/\s*\.{3}\s*more$/i, "");
  return text.length > 0 ? text : null;
}

function getFieldCell(row: Element, name: string): Element | null {
  return (
    row.querySelector(`td.field.${name}`) ??
    row.querySelector(`td.${name}`) ??
    row.querySelector(`.field.${name}`)
  );
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function dedupNonEmpty(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = raw.trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

// ---------- NETSCAPE / DL-DT fallback ----------

const TAG_REGEX =
  /<DT>\s*<H3[^>]*>([^<]*)<\/H3>|<DT>\s*<A\s+HREF="([^"]+)"[^>]*>([^<]*)<\/A>|<DD>([^<]*)|<\/DL>/gi;

type RatingRule = { pattern: RegExp; scale: (m: RegExpMatchArray) => number };

const NETSCAPE_RATING_RULES: ReadonlyArray<RatingRule> = [
  { pattern: /\((\d(?:\.\d)?)\s*\/\s*5\)/, scale: (m) => Number.parseFloat(m[1]) * 2 },
  { pattern: /\((\d(?:\.\d)?)\s*\/\s*10\)/, scale: (m) => Number.parseFloat(m[1]) },
  { pattern: /\b(\d(?:\.\d)?)\s*stars?\b/i, scale: (m) => Number.parseFloat(m[1]) * 2 },
  { pattern: /(★+)(?:☆+)?/, scale: (m) => m[1].length * 2 },
];

function parseGoodreadsNetscape(html: string): ParsedGoodreadsEntry[] {
  const entries: ParsedGoodreadsEntry[] = [];
  const shelfStack: string[] = [];
  let lastEntry: ParsedGoodreadsEntry | null = null;
  let pendingShelf: string | null = null;

  TAG_REGEX.lastIndex = 0;
  let match = TAG_REGEX.exec(html);
  while (match !== null) {
    const [whole, h3, href, anchorText, dd] = match;
    if (h3 !== undefined) {
      pendingShelf = decodeHtmlEntities(h3.trim());
      lastEntry = null;
    } else if (href !== undefined && anchorText !== undefined) {
      if (pendingShelf !== null) {
        shelfStack.push(pendingShelf);
        pendingShelf = null;
      }
      const rawTitle = decodeHtmlEntities(anchorText.trim());
      const entry: ParsedGoodreadsEntry = {
        url: href,
        title: stripRatingFromTitle(rawTitle),
        tags: [...shelfStack],
        rating: extractNetscapeRating(rawTitle),
        note: null,
      };
      entries.push(entry);
      lastEntry = entry;
    } else if (dd !== undefined && lastEntry !== null) {
      const ddText = decodeHtmlEntities(dd.trim());
      const ddRating = extractNetscapeRating(ddText);
      if (ddRating !== null) {
        lastEntry.rating = ddRating;
      }
    } else if (whole.toLowerCase().startsWith("</dl")) {
      if (pendingShelf !== null) {
        pendingShelf = null;
      } else if (shelfStack.length > 0) {
        shelfStack.pop();
      }
      lastEntry = null;
    }
    match = TAG_REGEX.exec(html);
  }

  return entries;
}

function extractNetscapeRating(text: string): number | null {
  for (const rule of NETSCAPE_RATING_RULES) {
    const m = text.match(rule.pattern);
    if (!m) continue;
    const value = rule.scale(m);
    if (Number.isNaN(value)) continue;
    return Math.max(0, Math.min(10, Math.round(value)));
  }
  return null;
}

function stripRatingFromTitle(title: string): string {
  let out = title;
  for (const rule of NETSCAPE_RATING_RULES) {
    out = out.replace(rule.pattern, "");
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

const NAMED_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number.parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);/g, (s) => NAMED_ENTITIES[s] ?? s);
}
