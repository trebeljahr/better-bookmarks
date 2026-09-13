/**
 * Raw URL list import.
 *
 * Input is a newline-separated block of URLs, one per line. Blank lines
 * and lines that begin with `#` (after leading whitespace) are ignored
 * — the `#` marker is intended as a full-line comment marker so users
 * can annotate their lists. There is NO inline tag/metadata syntax:
 * everything after the URL on the same line is treated as part of the
 * URL, so a URL fragment like `https://example.com/page#section` is
 * preserved verbatim.
 *
 * The importer canonicalises each URL and dedupes on ingest (two URLs
 * that collapse to the same canonical form become one bookmark).
 * Invalid URLs are SKIPPED with a `console.warn` line — the import
 * never throws for a single bad entry, so a corrupt line does not
 * abort the batch.
 *
 * No metadata is attached: no title, no tags, no rating. Enrichment
 * (if enabled) fetches the title later, out of band.
 *
 * Wired into the Options page as an "Import URL list" textarea and
 * `.txt` / `.urls` file upload; see `src/entrypoints/options/Options.tsx`.
 */

import { upsertBookmark } from "../storage/bookmarks";
import type { BasicImportReport } from "./index";

/**
 * Parse a raw URL list into an array of URL strings.
 *
 * Comments (`#…`) and blank lines are dropped. The URL text is
 * returned verbatim — canonicalisation happens later, in
 * `importRawUrls`, so callers who want the raw parse (for a preview,
 * say) still see whatever the user typed.
 */
export function parseRawUrls(text: string): string[] {
  const out: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    if (line.startsWith("#")) continue;
    out.push(line);
  }
  return out;
}

/**
 * Import a raw URL list.
 *
 * Steps per line:
 *   1. Skip blank/comment lines (see `parseRawUrls`).
 *   2. Upsert via `upsertBookmark`, which canonicalises the URL.
 *      Duplicates within the same batch collapse into a single
 *      bookmark on the second (and later) occurrence.
 *   3. If canonicalisation fails (unparseable URL or an
 *      unbookmarkable scheme like `javascript:`), log a warning and
 *      count the line as rejected. Never throws.
 *
 * Returns a per-batch report of new / merged / rejected counts.
 */
export async function importRawUrls(text: string): Promise<BasicImportReport> {
  const urls = parseRawUrls(text);
  const report: BasicImportReport = { imported: 0, merged: 0, rejected: 0 };
  for (const url of urls) {
    const result = await upsertBookmark({ rawUrl: url, capturedFrom: "manual" });
    if (!result.ok) {
      console.warn(
        `[rawUrls] skipping invalid URL "${url}" (reason: ${result.reason.reason})`,
      );
      report.rejected += 1;
      continue;
    }
    if (result.created) report.imported += 1;
    else report.merged += 1;
  }
  return report;
}
