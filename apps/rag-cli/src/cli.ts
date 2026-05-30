#!/usr/bin/env node
import { Command } from "commander";
import { ensureSchema, initDb, openDb, stats } from "./db.js";
import { embedMeta } from "./embedMeta.js";
import { ingestFile } from "./ingest.js";
import { search } from "./search.js";
import { serve } from "./serve.js";

const program = new Command();

program.name("bb").description("better-bookmarks RAG CLI").version("0.1.0");

program
  .command("init <dbPath>")
  .description("create SQLite database with RAG schema")
  .action((dbPath: string) => {
    const db = initDb(dbPath);
    const s = stats(db);
    db.close();
    console.log(`initialized ${dbPath}`);
    console.log(
      `  bookmarks=${s.bookmarks}  embedded=${s.embedded}  chunks=${s.chunks}  crawled=${s.crawled}`,
    );
  });

program
  .command("stats <dbPath>")
  .description("show row counts for a database")
  .action((dbPath: string) => {
    const db = openDb(dbPath);
    ensureSchema(db);
    const s = stats(db);
    db.close();
    console.log(JSON.stringify(s, null, 2));
  });

program
  .command("ingest <dbPath> <jsonPath>")
  .description("ingest a better-bookmarks-backup-*.json file into the database")
  .action((dbPath: string, jsonPath: string) => {
    const db = openDb(dbPath);
    ensureSchema(db);
    const t0 = performance.now();
    const report = ingestFile(db, jsonPath);
    const ms = Math.round(performance.now() - t0);
    const s = stats(db);
    db.close();
    console.log(`ingested ${jsonPath} in ${ms}ms`);
    console.log(
      `  total=${report.total}  inserted=${report.inserted}  updated=${report.updated}  unchanged=${report.unchanged}  skipped=${report.skipped}`,
    );
    console.log(`  db: bookmarks=${s.bookmarks}  embedded=${s.embedded}`);
    if (s.bookmarks > s.embedded) {
      console.log(`  next: bb embed --meta ${dbPath} (${s.bookmarks - s.embedded} pending)`);
    }
  });

program
  .command("embed <dbPath>")
  .description("embed metadata (title/desc/note/tags) for bookmarks missing vectors")
  .option("--batch-size <n>", "embedding batch size", (v) => Number.parseInt(v, 10), 32)
  .option("--limit <n>", "max bookmarks to embed this run", (v) => Number.parseInt(v, 10))
  .option("--base-url <url>", "ollama base URL", "http://127.0.0.1:11434")
  .option("--model <name>", "ollama embedding model", "nomic-embed-text")
  .action(async (dbPath: string, options) => {
    const db = openDb(dbPath);
    ensureSchema(db);
    const report = await embedMeta(db, {
      batchSize: options.batchSize,
      limit: options.limit,
      baseUrl: options.baseUrl,
      model: options.model,
    });
    const s = stats(db);
    db.close();
    if (report.total === 0) {
      console.log("no bookmarks pending embedding");
    } else {
      console.log(
        `embedded ${report.embedded}/${report.total} in ${report.ms}ms ` +
          `(skipped=${report.skipped}, failed=${report.failed})`,
      );
    }
    console.log(`  db: bookmarks=${s.bookmarks}  embedded=${s.embedded}`);
  });

program
  .command("search <dbPath> <query...>")
  .description("semantic search over embedded bookmarks")
  .option("-k, --k <n>", "top K results", (v) => Number.parseInt(v, 10), 20)
  .option("--tag <tag...>", "filter by tag (repeat for AND)")
  .option("--domain <domain>", "filter by domain")
  .option("--status <status>", "filter by read status")
  .option("--rating-gte <n>", "minimum rating", (v) => Number.parseFloat(v))
  .option("--json", "emit JSON")
  .option("--base-url <url>", "ollama base URL", "http://127.0.0.1:11434")
  .option("--model <name>", "ollama embedding model", "nomic-embed-text")
  .action(async (dbPath: string, queryParts: string[], options) => {
    const db = openDb(dbPath);
    ensureSchema(db);
    const t0 = performance.now();
    const hits = await search(db, queryParts.join(" "), {
      k: options.k,
      filters: {
        tags: options.tag,
        domain: options.domain,
        status: options.status,
        ratingGte: options.ratingGte,
      },
      baseUrl: options.baseUrl,
      model: options.model,
    });
    const ms = Math.round(performance.now() - t0);
    db.close();
    if (options.json) {
      console.log(JSON.stringify({ ms, hits }, null, 2));
    } else {
      console.log(`${hits.length} hits in ${ms}ms`);
      for (const h of hits) {
        const tagStr = h.tags.length ? `  [${h.tags.join(", ")}]` : "";
        const rating = h.rating != null ? ` ★${h.rating}` : "";
        console.log(`  ${h.score.toFixed(3)}  ${h.title}${rating}${tagStr}`);
        console.log(`         ${h.url}`);
      }
    }
  });

program
  .command("serve <dbPath>")
  .description("HTTP server on localhost for sidepanel + Raycast + delta sync")
  .option("-p, --port <n>", "port", (v) => Number.parseInt(v, 10), 51847)
  .option("--host <host>", "bind host", "127.0.0.1")
  .option("--base-url <url>", "ollama base URL", "http://127.0.0.1:11434")
  .option("--model <name>", "ollama embedding model", "nomic-embed-text")
  .action(async (dbPath: string, options) => {
    const db = openDb(dbPath);
    ensureSchema(db);
    const handle = await serve(db, {
      port: options.port,
      host: options.host,
      baseUrl: options.baseUrl,
      model: options.model,
    });
    console.log(`bb serve listening on ${handle.url}`);
    console.log(`  GET  ${handle.url}/health`);
    console.log(`  GET  ${handle.url}/search?q=...&k=20&tag=...&status=...`);
    console.log(`  POST ${handle.url}/bookmarks    (delta ingest)`);
    const shutdown = async () => {
      console.log("\nshutting down…");
      await handle.close();
      db.close();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
