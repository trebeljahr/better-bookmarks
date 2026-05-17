import type { ReadStatus } from "../../shared/types";
import { upsertBookmark } from "../storage/bookmarks";
import { getDB } from "../storage/db";
import type { BasicImportReport } from "./index";

type PocketRow = {
  title: string;
  url: string;
  timeAdded: number | null;
  tags: string[];
  status: ReadStatus;
};

export function parsePocketCsv(csv: string): PocketRow[] {
  const rows = parseCsvRows(csv);
  if (rows.length === 0) return [];
  const header = rows[0].map((c) => c.trim().toLowerCase());
  const idx = {
    title: header.indexOf("title"),
    url: header.indexOf("url"),
    time: header.indexOf("time_added"),
    tags: header.indexOf("tags"),
    status: header.indexOf("status"),
  };
  if (idx.url === -1) return [];

  const out: PocketRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const url = row[idx.url];
    if (!url?.trim()) continue;
    out.push({
      title: idx.title >= 0 ? (row[idx.title] ?? "") : "",
      url: url.trim(),
      timeAdded: idx.time >= 0 ? parsePocketTime(row[idx.time]) : null,
      tags: idx.tags >= 0 ? parsePocketTags(row[idx.tags] ?? "") : [],
      status: idx.status >= 0 ? mapPocketStatus(row[idx.status]) : "unread",
    });
  }
  return out;
}

function parsePocketTime(raw: string | undefined): number | null {
  if (!raw) return null;
  const seconds = Number.parseInt(raw.trim(), 10);
  if (Number.isNaN(seconds) || seconds <= 0) return null;
  return seconds * 1000;
}

function parsePocketTags(raw: string): string[] {
  return raw
    .split(/[|,]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function mapPocketStatus(raw: string | undefined): ReadStatus {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "archive" || v === "archived") return "archived";
  if (v === "read") return "read";
  return "unread";
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let cell = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (inQuotes) {
      if (ch === '"') {
        if (csv[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\r") continue;
    if (ch === "\n") {
      row.push(cell);
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += ch;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((c) => c.length > 0)) rows.push(row);
  }
  return rows;
}

export async function importPocketCsv(csv: string): Promise<BasicImportReport> {
  const rows = parsePocketCsv(csv);
  const report: BasicImportReport = { imported: 0, merged: 0, rejected: 0 };
  for (const row of rows) {
    const result = await upsertBookmark({
      rawUrl: row.url,
      title: row.title,
      tags: row.tags,
      status: row.status,
      capturedFrom: "pocket",
    });
    if (!result.ok) {
      report.rejected += 1;
      continue;
    }
    if (result.created && row.timeAdded !== null) {
      await getDB().bookmarks.update(result.bookmark.id, {
        createdAt: row.timeAdded,
      });
    }
    if (result.created) report.imported += 1;
    else report.merged += 1;
  }
  return report;
}
