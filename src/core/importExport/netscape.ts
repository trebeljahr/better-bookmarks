import type { Bookmark } from "../../shared/types";
import { listBookmarks } from "../storage/bookmarks";

const UNTAGGED_FOLDER = "Better Bookmarks";

export async function exportNetscape(): Promise<string> {
  const bookmarks = await listBookmarks();

  const byTag = new Map<string, Bookmark[]>();
  const untagged: Bookmark[] = [];

  for (const b of bookmarks) {
    if (!b.tags || b.tags.length === 0) {
      untagged.push(b);
      continue;
    }
    for (const tag of b.tags) {
      const list = byTag.get(tag) ?? [];
      list.push(b);
      byTag.set(tag, list);
    }
  }

  const lines: string[] = [
    "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
    "<!-- This is an automatically generated file. Do not edit. -->",
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    "<TITLE>Bookmarks</TITLE>",
    "<H1>Bookmarks</H1>",
    "<DL><p>",
  ];

  const sortedTags = Array.from(byTag.keys()).sort((a, b) => a.localeCompare(b));
  for (const tag of sortedTags) {
    const items = byTag.get(tag) ?? [];
    appendFolder(lines, tag, items);
  }

  if (untagged.length > 0) {
    appendFolder(lines, UNTAGGED_FOLDER, untagged);
  }

  lines.push("</DL><p>");
  return `${lines.join("\n")}\n`;
}

function appendFolder(lines: string[], folderName: string, items: Bookmark[]): void {
  lines.push(`    <DT><H3>${escapeHtml(folderName)}</H3>`);
  lines.push("    <DL><p>");
  for (const b of items) {
    lines.push(formatBookmarkLine(b));
  }
  lines.push("    </DL><p>");
}

function formatBookmarkLine(b: Bookmark): string {
  const addDateSec = Math.floor(b.createdAt / 1000);
  const href = escapeHtml(b.originalUrl);
  const title = escapeHtml(b.title || b.originalUrl);
  return `        <DT><A HREF="${href}" ADD_DATE="${addDateSec}">${title}</A>`;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
