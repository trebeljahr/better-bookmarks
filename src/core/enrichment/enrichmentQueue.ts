/**
 * In-memory enrichment queue + sweep entrypoint.
 *
 * Service-worker scope: state is best-effort, dropped when the worker
 * suspends. The sweep is the durable mechanism — it re-finds stale
 * bookmarks every alarm tick and re-enqueues them.
 *
 * Domain-level backoff prevents pounding a server that just failed: each
 * failed fetch doubles the wait for the next request to that domain, up to
 * a cap. Successful fetches reset the backoff.
 */

import type { Bookmark } from "../../shared/types";
import { getBookmarkById, listBookmarks } from "../storage/bookmarks";
import { type EnrichOptions, type EnrichResult, enrichBookmark } from "./enrich";

export const DEFAULT_CONCURRENCY = 2;
export const DEFAULT_DELAY_MS = 1000;
export const DEFAULT_STALE_AFTER_MS = 90 * 24 * 60 * 60 * 1000;
export const DEFAULT_SWEEP_LIMIT = 25;
const BACKOFF_INITIAL_MS = 30_000;
const BACKOFF_MAX_MS = 60 * 60 * 1000;

type QueueDeps = {
  enrich: (b: Bookmark, opts?: EnrichOptions) => Promise<EnrichResult>;
  getBookmark: (id: string) => Promise<Bookmark | undefined>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  concurrency: number;
  delayMs: number;
};

type BackoffEntry = {
  nextAttemptAt: number;
  failureCount: number;
};

const pending: string[] = [];
const inFlight = new Set<string>();
const domainBackoff = new Map<string, BackoffEntry>();
let processing = false;
let deps: QueueDeps = defaultDeps();
let generation = 0;

function defaultDeps(): QueueDeps {
  return {
    enrich: enrichBookmark,
    getBookmark: getBookmarkById,
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    concurrency: DEFAULT_CONCURRENCY,
    delayMs: DEFAULT_DELAY_MS,
  };
}

export function _configureEnrichmentQueueForTests(overrides: Partial<QueueDeps>): void {
  deps = { ...defaultDeps(), ...overrides };
}

export function _resetEnrichmentQueueForTests(): void {
  generation++;
  pending.length = 0;
  inFlight.clear();
  domainBackoff.clear();
  processing = false;
  deps = defaultDeps();
}

export function _peekEnrichmentQueueForTests(): {
  pending: string[];
  inFlight: string[];
  backoff: Array<[string, BackoffEntry]>;
} {
  return {
    pending: [...pending],
    inFlight: [...inFlight],
    backoff: Array.from(domainBackoff.entries()),
  };
}

export function enqueueEnrichment(bookmarkId: string): void {
  if (pending.includes(bookmarkId) || inFlight.has(bookmarkId)) return;
  pending.push(bookmarkId);
  void runQueue();
}

async function runQueue(): Promise<void> {
  if (processing) return;
  processing = true;
  const myGen = generation;
  try {
    while (pending.length > 0 || inFlight.size > 0) {
      if (myGen !== generation) return;
      while (pending.length > 0 && inFlight.size < deps.concurrency) {
        const id = pending.shift();
        if (!id) break;
        inFlight.add(id);
        void processOne(id, myGen).finally(() => {
          if (myGen === generation) inFlight.delete(id);
        });
      }
      if (inFlight.size === 0) break;
      await deps.sleep(deps.delayMs);
    }
  } finally {
    if (myGen === generation) processing = false;
  }
}

async function processOne(id: string, myGen: number): Promise<void> {
  let bookmark: Bookmark | undefined;
  try {
    bookmark = await deps.getBookmark(id);
  } catch (err) {
    console.warn("enrichmentQueue: getBookmark failed", id, err);
    return;
  }
  if (myGen !== generation || !bookmark) return;

  const domain = bookmark.domain;
  const now = deps.now();
  const backoff = domainBackoff.get(domain);
  if (backoff && backoff.nextAttemptAt > now) {
    // Domain is in cooldown — drop from the live queue. The sweep alarm
    // is the durable retry path; re-queueing here would spin the queue
    // forever when several bookmarks from a flaky domain pile up.
    return;
  }

  try {
    const result = await deps.enrich(bookmark);
    if (myGen !== generation) return;
    if (result.reason && isNetworkFailure(result.reason)) {
      bumpBackoff(domain, now);
    } else {
      domainBackoff.delete(domain);
    }
  } catch (err) {
    if (myGen !== generation) return;
    console.warn("enrichmentQueue: enrich threw", id, err);
    bumpBackoff(domain, now);
  }
}

function isNetworkFailure(reason: string): boolean {
  return reason === "network" || reason === "timeout";
}

function bumpBackoff(domain: string, now: number): void {
  const current = domainBackoff.get(domain);
  const failureCount = (current?.failureCount ?? 0) + 1;
  const waitMs = Math.min(BACKOFF_INITIAL_MS * 2 ** (failureCount - 1), BACKOFF_MAX_MS);
  domainBackoff.set(domain, {
    nextAttemptAt: now + waitMs,
    failureCount,
  });
}

export type SweepOpts = {
  limit?: number;
  staleAfterMs?: number;
  now?: number;
};

export type SweepResult = {
  enriched: number;
  skipped: number;
};

/**
 * Find bookmarks whose `enrichedAt` is absent or older than `staleAfterMs`
 * and enrich up to `limit` of them synchronously. The function awaits each
 * enrichment so callers (alarm handler) get an accurate counted result.
 *
 * Newest-stale-first ordering — keeps recently captured bookmarks ahead of
 * the long tail when the limit is hit.
 */
export async function runEnrichmentSweep(opts: SweepOpts = {}): Promise<SweepResult> {
  const limit = opts.limit ?? DEFAULT_SWEEP_LIMIT;
  const staleAfter = opts.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const now = opts.now ?? deps.now();
  const all = await listBookmarks();
  const stale = all.filter((b) => isStale(b, now, staleAfter));
  stale.sort((a, b) => b.createdAt - a.createdAt);
  const candidates = stale.slice(0, limit);
  let enriched = 0;
  let skipped = 0;
  for (const bm of candidates) {
    try {
      const result = await deps.enrich(bm);
      if (result.updated) enriched++;
      else skipped++;
    } catch (err) {
      console.warn("runEnrichmentSweep: enrich threw", bm.id, err);
      skipped++;
    }
  }
  return { enriched, skipped };
}

function isStale(b: Bookmark, now: number, staleAfter: number): boolean {
  if (typeof b.enrichedAt !== "number") return true;
  return now - b.enrichedAt > staleAfter;
}
