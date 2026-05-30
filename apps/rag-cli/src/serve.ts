import type { Database as Db } from "better-sqlite3";
import cors from "cors";
import express from "express";
import { ingestBookmarks, type SourceBookmark } from "./ingest.js";
import { type SearchFilters, search } from "./search.js";

export type ServeOpts = {
  port?: number;
  host?: string;
  baseUrl?: string;
  model?: string;
};

export type ServeHandle = {
  url: string;
  close: () => Promise<void>;
};

export async function serve(db: Db, opts: ServeOpts = {}): Promise<ServeHandle> {
  const port = opts.port ?? 51847;
  const host = opts.host ?? "127.0.0.1";
  const app = express();

  app.use(cors({ origin: true }));
  app.use(express.json({ limit: "50mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });

  app.get("/search", async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    if (!q.trim()) {
      res.status(400).json({ error: "q is required" });
      return;
    }
    const filters = parseFilters(req.query);
    const k = clampK(req.query.k);
    try {
      const hits = await search(db, q, {
        k,
        filters,
        baseUrl: opts.baseUrl,
        model: opts.model,
      });
      res.json({ q, k, filters, hits });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/bookmarks", (req, res) => {
    const body = req.body as { bookmarks?: SourceBookmark[] };
    if (!body || !Array.isArray(body.bookmarks)) {
      res.status(400).json({ error: "body.bookmarks[] required" });
      return;
    }
    try {
      const report = ingestBookmarks(db, body.bookmarks);
      res.json(report);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  const server = app.listen(port, host);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", () => resolve());
    server.once("error", reject);
  });

  const url = `http://${host}:${port}`;
  return {
    url,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

function parseFilters(q: express.Request["query"]): SearchFilters {
  const tagsRaw = q.tag ?? q.tags;
  const tags = toArray(tagsRaw)
    .map((t) => String(t).trim())
    .filter(Boolean);
  const filters: SearchFilters = {};
  if (tags.length > 0) filters.tags = tags;
  if (typeof q.domain === "string" && q.domain) filters.domain = q.domain;
  if (typeof q.status === "string" && q.status) filters.status = q.status;
  if (typeof q.ratingGte === "string" && q.ratingGte) {
    const n = Number(q.ratingGte);
    if (!Number.isNaN(n)) filters.ratingGte = n;
  }
  return filters;
}

function toArray(v: unknown): unknown[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function clampK(v: unknown): number {
  const n = typeof v === "string" ? Number.parseInt(v, 10) : NaN;
  if (!Number.isFinite(n)) return 20;
  return Math.min(100, Math.max(1, n));
}
