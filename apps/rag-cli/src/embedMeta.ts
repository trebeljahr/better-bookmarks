import type { Database as Db } from "better-sqlite3";
import { SingleBar } from "cli-progress";
import {
  DEFAULT_EMBED_MODEL,
  DEFAULT_OLLAMA_URL,
  embedBatchWithRetry,
  metaText,
  vectorToBuffer,
} from "./embed.js";

export type EmbedMetaOpts = {
  baseUrl?: string;
  model?: string;
  batchSize?: number;
  limit?: number;
  showProgress?: boolean;
};

export type EmbedMetaReport = {
  embedded: number;
  skipped: number;
  failed: number;
  total: number;
  ms: number;
};

type PendingRow = {
  id: string;
  title: string | null;
  description: string | null;
  note: string | null;
  tags_json: string | null;
  domain: string | null;
};

export async function embedMeta(db: Db, opts: EmbedMetaOpts = {}): Promise<EmbedMetaReport> {
  const baseUrl = opts.baseUrl ?? DEFAULT_OLLAMA_URL;
  const model = opts.model ?? DEFAULT_EMBED_MODEL;
  const batchSize = opts.batchSize ?? 32;
  const showProgress = opts.showProgress ?? true;

  const limitClause = typeof opts.limit === "number" ? `LIMIT ${opts.limit}` : "";
  const pending = db
    .prepare(
      `SELECT b.id, b.title, b.description, b.note, b.tags_json, b.domain
       FROM bookmarks b
       LEFT JOIN vec_bookmarks v ON v.bookmark_id = b.id
       WHERE v.bookmark_id IS NULL
       ORDER BY b.updated_at DESC
       ${limitClause}`,
    )
    .all() as PendingRow[];

  const report: EmbedMetaReport = {
    embedded: 0,
    skipped: 0,
    failed: 0,
    total: pending.length,
    ms: 0,
  };

  if (pending.length === 0) return report;

  const insertVec = db.prepare(
    "INSERT OR REPLACE INTO vec_bookmarks (bookmark_id, embedding) VALUES (?, ?)",
  );
  const markEmbedded = db.prepare("UPDATE bookmarks SET embedded_at = ? WHERE id = ?");

  const bar = showProgress
    ? new SingleBar({
        format:
          "embed [{bar}] {percentage}% | {value}/{total} | {duration_formatted} | ETA {eta_formatted}",
        hideCursor: true,
      })
    : null;
  bar?.start(pending.length, 0);

  const t0 = performance.now();

  for (let i = 0; i < pending.length; i += batchSize) {
    const slice = pending.slice(i, i + batchSize);
    const inputs: string[] = [];
    const ids: string[] = [];
    for (const row of slice) {
      const tags = parseTags(row.tags_json);
      const text = metaText({
        title: row.title,
        domain: row.domain,
        tags,
        description: row.description,
        note: row.note,
      });
      if (!text.trim()) {
        report.skipped++;
        continue;
      }
      inputs.push(text);
      ids.push(row.id);
    }
    if (inputs.length === 0) {
      bar?.update(report.embedded + report.skipped + report.failed);
      continue;
    }
    try {
      const vectors = await embedBatchWithRetry(inputs, { baseUrl, model });
      const now = Date.now();
      const apply = db.transaction(() => {
        for (let j = 0; j < ids.length; j++) {
          const idJ = ids[j];
          const vecJ = vectors[j];
          if (!idJ || !vecJ) continue;
          insertVec.run(idJ, vectorToBuffer(vecJ));
          markEmbedded.run(now, idJ);
        }
      });
      apply();
      report.embedded += ids.length;
    } catch (err) {
      report.failed += ids.length;
      console.error(
        `embed batch failed (${ids.length} rows): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    bar?.update(report.embedded + report.skipped + report.failed);
  }

  bar?.stop();
  report.ms = Math.round(performance.now() - t0);
  return report;
}

function parseTags(json: string | null): string[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}
