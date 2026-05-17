import type { Bookmark, Edge, Tag } from "../../shared/types";
import { canonicalize } from "../canonicalizer";
import { listAllEdges } from "../edges/crud";
import { dedupTags, listBookmarks } from "../storage/bookmarks";
import { getDB } from "../storage/db";
import { listTags } from "../storage/tags";

export const JSON_EXPORT_VERSION = 1;

export type JsonExport = {
  version: number;
  exportedAt: number;
  bookmarks: Bookmark[];
  tags: Tag[];
  edges: Edge[];
};

export type ImportReport = {
  bookmarksImported: number;
  bookmarksMerged: number;
  bookmarksSkipped: number;
  tagsImported: number;
  tagsMerged: number;
  edgesImported: number;
  edgesSkipped: number;
  errors: string[];
};

export async function exportJson(): Promise<string> {
  const [bookmarks, tags, edges] = await Promise.all([listBookmarks(), listTags(), listAllEdges()]);
  const payload: JsonExport = {
    version: JSON_EXPORT_VERSION,
    exportedAt: Date.now(),
    bookmarks,
    tags,
    edges,
  };
  return JSON.stringify(payload, null, 2);
}

export async function importJson(
  json: string,
  opts: { dryRun?: boolean } = {},
): Promise<ImportReport> {
  const parsed = JSON.parse(json) as Partial<JsonExport>;
  if (typeof parsed.version !== "number") {
    throw new Error("importJson: missing or invalid version field");
  }
  if (parsed.version !== JSON_EXPORT_VERSION) {
    throw new Error(
      `importJson: unsupported version ${parsed.version} (expected ${JSON_EXPORT_VERSION})`,
    );
  }

  const report: ImportReport = {
    bookmarksImported: 0,
    bookmarksMerged: 0,
    bookmarksSkipped: 0,
    tagsImported: 0,
    tagsMerged: 0,
    edgesImported: 0,
    edgesSkipped: 0,
    errors: [],
  };

  const bookmarks = Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [];
  const tags = Array.isArray(parsed.tags) ? parsed.tags : [];
  const edges = Array.isArray(parsed.edges) ? parsed.edges : [];

  const dryRun = opts.dryRun === true;

  for (const record of bookmarks) {
    try {
      const outcome = await importBookmark(record, dryRun);
      if (outcome === "created") report.bookmarksImported++;
      else if (outcome === "merged") report.bookmarksMerged++;
      else report.bookmarksSkipped++;
    } catch (err) {
      report.bookmarksSkipped++;
      report.errors.push(`bookmark ${record?.id ?? "?"}: ${(err as Error).message}`);
    }
  }

  for (const tag of tags) {
    try {
      const outcome = await importTag(tag, dryRun);
      if (outcome === "created") report.tagsImported++;
      else report.tagsMerged++;
    } catch (err) {
      report.errors.push(`tag ${tag?.name ?? "?"}: ${(err as Error).message}`);
    }
  }

  for (const edge of edges) {
    try {
      const outcome = await importEdge(edge, dryRun);
      if (outcome === "created") report.edgesImported++;
      else report.edgesSkipped++;
    } catch (err) {
      report.edgesSkipped++;
      report.errors.push(`edge ${edge?.id ?? "?"}: ${(err as Error).message}`);
    }
  }

  return report;
}

async function importBookmark(
  record: Bookmark,
  dryRun: boolean,
): Promise<"created" | "merged" | "skipped"> {
  if (!record?.originalUrl) return "skipped";
  const c = canonicalize(record.originalUrl);
  if (!c.ok) return "skipped";

  const db = getDB();
  return db.transaction("rw", db.bookmarks, async () => {
    const existing = await db.bookmarks.where("canonicalUrl").equals(c.canonical).first();
    if (existing) {
      if (!dryRun) {
        await db.bookmarks.put(mergeImportedBookmark(existing, record));
      }
      return "merged";
    }
    if (!dryRun) {
      const fresh: Bookmark = {
        ...record,
        canonicalUrl: c.canonical,
        domain: c.domain,
        tags: dedupTags(record.tags ?? []),
      };
      await db.bookmarks.put(fresh);
    }
    return "created";
  });
}

function mergeImportedBookmark(existing: Bookmark, imported: Bookmark): Bookmark {
  const importedNewer = (imported.updatedAt ?? 0) > existing.updatedAt;
  const base = importedNewer ? imported : existing;
  return {
    ...base,
    id: existing.id,
    canonicalUrl: existing.canonicalUrl,
    domain: existing.domain,
    createdAt: Math.min(existing.createdAt, imported.createdAt ?? existing.createdAt),
    updatedAt: Math.max(existing.updatedAt, imported.updatedAt ?? 0),
    tags: dedupTags([...(existing.tags ?? []), ...(imported.tags ?? [])]),
  };
}

async function importTag(tag: Tag, dryRun: boolean): Promise<"created" | "merged"> {
  if (!tag?.name) throw new Error("missing name");
  const db = getDB();
  const lowercaseName = tag.lowercaseName ?? tag.name.toLowerCase();
  return db.transaction("rw", db.tags, async () => {
    const existing = await db.tags.where("lowercaseName").equals(lowercaseName).first();
    if (existing) {
      if (!dryRun) {
        const merged: Tag = {
          ...existing,
          parentName: tag.parentName ?? existing.parentName,
          color: tag.color ?? existing.color,
          description: tag.description || existing.description,
          mirrorFolderId: existing.mirrorFolderId ?? tag.mirrorFolderId ?? null,
          createdAt: Math.min(existing.createdAt, tag.createdAt ?? existing.createdAt),
        };
        await db.tags.put(merged);
      }
      return "merged";
    }
    if (!dryRun) {
      const fresh: Tag = {
        name: tag.name,
        lowercaseName,
        parentName: tag.parentName ?? null,
        color: tag.color ?? null,
        description: tag.description ?? "",
        mirrorFolderId: tag.mirrorFolderId ?? null,
        createdAt: tag.createdAt ?? Date.now(),
      };
      await db.tags.put(fresh);
    }
    return "created";
  });
}

async function importEdge(edge: Edge, dryRun: boolean): Promise<"created" | "skipped"> {
  if (!edge?.fromId || !edge?.toId || !edge?.type) {
    throw new Error("missing fromId/toId/type");
  }
  if (edge.fromId === edge.toId) return "skipped";

  const db = getDB();
  const existing = await db.edges
    .where("fromId")
    .equals(edge.fromId)
    .and((e) => e.toId === edge.toId && e.type === edge.type)
    .first();
  if (existing) return "skipped";

  if (!dryRun) {
    const fromExists = await db.bookmarks.get(edge.fromId);
    const toExists = await db.bookmarks.get(edge.toId);
    if (!fromExists || !toExists) {
      throw new Error("edge references missing bookmark");
    }
    await db.edges.put({
      ...edge,
      note: edge.note ?? "",
      directed: edge.directed ?? false,
      createdAt: edge.createdAt ?? Date.now(),
      source: edge.source ?? "manual",
    });
  }
  return "created";
}
