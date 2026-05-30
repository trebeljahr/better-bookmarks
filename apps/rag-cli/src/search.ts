import type { Database as Db } from "better-sqlite3";
import {
  DEFAULT_EMBED_MODEL,
  DEFAULT_OLLAMA_URL,
  embedBatchWithRetry,
  vectorToBuffer,
} from "./embed.js";

export type SearchFilters = {
  tags?: string[];
  domain?: string;
  status?: string;
  ratingGte?: number;
};

export type SearchOpts = {
  k?: number;
  filters?: SearchFilters;
  baseUrl?: string;
  model?: string;
};

export type SearchHit = {
  id: string;
  url: string;
  title: string;
  description: string;
  note: string;
  domain: string;
  tags: string[];
  rating: number | null;
  status: string | null;
  score: number;
};

type Row = {
  id: string;
  canonical_url: string;
  title: string | null;
  description: string | null;
  note: string | null;
  domain: string | null;
  tags_json: string | null;
  rating: number | null;
  status: string | null;
  distance: number;
};

export async function search(db: Db, query: string, opts: SearchOpts = {}): Promise<SearchHit[]> {
  const k = opts.k ?? 20;
  const baseUrl = opts.baseUrl ?? DEFAULT_OLLAMA_URL;
  const model = opts.model ?? DEFAULT_EMBED_MODEL;

  const [queryVec] = await embedBatchWithRetry([query], { baseUrl, model });
  if (!queryVec) throw new Error("search: empty query embedding");
  const queryBuf = vectorToBuffer(queryVec);

  const where: string[] = [];
  const params: unknown[] = [queryBuf];
  const filters = opts.filters ?? {};

  if (filters.domain) {
    where.push("b.domain = ?");
    params.push(filters.domain);
  }
  if (filters.status) {
    where.push("b.status = ?");
    params.push(filters.status);
  }
  if (typeof filters.ratingGte === "number") {
    where.push("b.rating >= ?");
    params.push(filters.ratingGte);
  }
  if (filters.tags && filters.tags.length > 0) {
    const placeholders = filters.tags.map(() => "?").join(",");
    where.push(
      `b.id IN (SELECT bookmark_id FROM tag_bookmarks WHERE tag IN (${placeholders}) GROUP BY bookmark_id HAVING COUNT(DISTINCT tag) = ?)`,
    );
    for (const t of filters.tags) params.push(t.toLowerCase().trim());
    params.push(filters.tags.length);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  params.push(k);

  const sql = `
    SELECT b.id, b.canonical_url, b.title, b.description, b.note, b.domain,
           b.tags_json, b.rating, b.status,
           vec_distance_cosine(v.embedding, ?) AS distance
    FROM vec_bookmarks v
    JOIN bookmarks b ON b.id = v.bookmark_id
    ${whereSql}
    ORDER BY distance ASC
    LIMIT ?
  `;

  const rows = db.prepare(sql).all(...params) as Row[];
  return rows.map((r) => ({
    id: r.id,
    url: r.canonical_url,
    title: r.title ?? "",
    description: r.description ?? "",
    note: r.note ?? "",
    domain: r.domain ?? "",
    tags: parseTags(r.tags_json),
    rating: r.rating,
    status: r.status,
    score: 1 - r.distance,
  }));
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
