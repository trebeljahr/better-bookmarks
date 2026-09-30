import { timingSafeEqual } from "node:crypto";
import type { Database as Db } from "better-sqlite3";
import cors from "cors";
import express from "express";
import { ingestBookmarks, type SourceBookmark } from "./ingest.js";
import { type SearchFilters, search } from "./search.js";

export type ServeOpts = {
  token?: string;
  origins?: string[];
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
  const token = opts.token ?? process.env.BB_API_TOKEN;
  if (!token || token.length < 32)
    throw new Error("BB_API_TOKEN must contain at least 32 characters");
  if (!["127.0.0.1", "::1", "localhost"].includes(host)) {
    throw new Error("RAG API must bind to loopback");
  }
  const origins = new Set(
    opts.origins ?? (process.env.BB_API_ORIGINS ?? "").split(",").filter(Boolean),
  );
  const app = express();
  app.disable("x-powered-by");

  app.use((req, res, next) => {
    const actualPort = req.socket.localPort;
    const allowedHosts = new Set([
      `127.0.0.1:${actualPort}`,
      `localhost:${actualPort}`,
      `[::1]:${actualPort}`,
    ]);
    if (
      !allowedHosts.has(req.headers.host ?? "") ||
      (req.headers.origin !== undefined && !origins.has(req.headers.origin))
    ) {
      res.status(403).json({ error: "Host or origin not allowed" });
      return;
    }
    next();
  });
  app.use(
    cors({
      origin: (origin, callback) => callback(null, !!origin && origins.has(origin)),
      methods: ["GET", "POST"],
      allowedHeaders: ["Authorization", "Content-Type"],
    }),
  );
  app.use((req, res, next) => {
    const supplied = Buffer.from(req.headers.authorization ?? "");
    const expected = Buffer.from(`Bearer ${token}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      res.status(401).json({ error: "Bearer token required" });
      return;
    }
    next();
  });
  app.use(express.json({ limit: "2mb", inflate: false }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });

  app.get("/search", async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    if (!q.trim() || q.length > 4096) {
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
    if (!body || !Array.isArray(body.bookmarks) || body.bookmarks.length > 500) {
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

  const handleError: express.ErrorRequestHandler = (error, _req, res, _next) => {
    const status = error?.status === 413 ? 413 : error?.status === 415 ? 415 : 400;
    res
      .status(status)
      .json({ error: status === 413 ? "Request too large" : "Invalid request body" });
  };
  app.use(handleError);

  const server = app.listen(port, host);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", () => resolve());
    server.once("error", reject);
  });

  const address = server.address();
  const url = `http://${host === "::1" ? "[::1]" : host}:${typeof address === "object" && address ? address.port : port}`;
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
