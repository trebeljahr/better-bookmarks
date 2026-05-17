import { upsertBookmark } from "../storage/bookmarks";
import type { BasicImportReport } from "./index";

type RawEntry = { url: string; tags: string[] };

export function parseRawUrlList(text: string): RawEntry[] {
  const out: RawEntry[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    if (line.startsWith("#")) continue;

    const sepMatch = line.match(/\s+#\s*/);
    const urlPart = sepMatch ? line.slice(0, sepMatch.index).trim() : line;
    const tagPart =
      sepMatch && sepMatch.index !== undefined
        ? line.slice(sepMatch.index + sepMatch[0].length).trim()
        : "";
    if (urlPart.length === 0) continue;

    const tags = tagPart
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    out.push({ url: urlPart, tags });
  }
  return out;
}

export async function importRawUrlList(text: string): Promise<BasicImportReport> {
  const entries = parseRawUrlList(text);
  const report: BasicImportReport = { imported: 0, merged: 0, rejected: 0 };
  for (const entry of entries) {
    const result = await upsertBookmark({
      rawUrl: entry.url,
      tags: entry.tags,
      capturedFrom: "manual",
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
