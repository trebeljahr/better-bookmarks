import { upsertBookmark } from "../storage/bookmarks";
import type { BasicImportReport } from "./index";

type ParsedEntry = {
  url: string;
  title: string;
  tags: string[];
  rating: number | null;
};

const TAG_REGEX =
  /<DT>\s*<H3[^>]*>([^<]*)<\/H3>|<DT>\s*<A\s+HREF="([^"]+)"[^>]*>([^<]*)<\/A>|<DD>([^<]*)|<\/DL>/gi;

type RatingRule = { pattern: RegExp; scale: (m: RegExpMatchArray) => number };

const RATING_RULES: ReadonlyArray<RatingRule> = [
  { pattern: /\((\d(?:\.\d)?)\s*\/\s*5\)/, scale: (m) => Number.parseFloat(m[1]) * 2 },
  { pattern: /\((\d(?:\.\d)?)\s*\/\s*10\)/, scale: (m) => Number.parseFloat(m[1]) },
  { pattern: /\b(\d(?:\.\d)?)\s*stars?\b/i, scale: (m) => Number.parseFloat(m[1]) * 2 },
  { pattern: /(★+)(?:☆+)?/, scale: (m) => m[1].length * 2 },
];

export function parseGoodreadsHtml(html: string): ParsedEntry[] {
  const entries: ParsedEntry[] = [];
  const shelfStack: string[] = [];
  let lastEntry: ParsedEntry | null = null;
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
      const entry: ParsedEntry = {
        url: href,
        title: stripRatingFromTitle(rawTitle),
        tags: [...shelfStack],
        rating: extractRating(rawTitle),
      };
      entries.push(entry);
      lastEntry = entry;
    } else if (dd !== undefined && lastEntry !== null) {
      const ddRating = extractRating(decodeHtmlEntities(dd.trim()));
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

function extractRating(text: string): number | null {
  for (const rule of RATING_RULES) {
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
  for (const rule of RATING_RULES) {
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

export async function importGoodreadsHtml(html: string): Promise<BasicImportReport> {
  const entries = parseGoodreadsHtml(html);
  const report: BasicImportReport = { imported: 0, merged: 0, rejected: 0 };
  for (const entry of entries) {
    const result = await upsertBookmark({
      rawUrl: entry.url,
      title: entry.title,
      tags: entry.tags,
      rating: entry.rating,
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
