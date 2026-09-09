import type {
  Bookmark,
  LinkCheckFailureEntry,
  LinkCheckReason,
  LinkCheckResult,
  LinkCheckStatus,
} from "../../shared/types";
import { listBookmarks, updateBookmark } from "../storage/bookmarks";

const DEFAULT_LIMIT = 50;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;
const BATCH_JITTER_MS = 100;

// Retry policy for transient probe outcomes (429 / 5xx / network / timeout).
// See docs/DEAD_LINK_CHECKER.md.
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_BACKOFF_MS = 1000;

// A bookmark is only flagged "dead" (ok=false) after permanent-looking
// failures on at least this many distinct calendar days (UTC). This
// protects against single-day network hiccups and rate limiting.
export const CONSECUTIVE_DAY_THRESHOLD = 3;

// Cap the on-bookmark failure log so we don't grow unbounded.
const FAILURE_LOG_MAX = 20;

const DAY_MS = 24 * 60 * 60 * 1000;

export type CheckOpts = {
  now?: number;
  maxRetries?: number;
  baseBackoffMs?: number;
  sleep?: (ms: number) => Promise<void>;
  requestTimeoutMs?: number;
};

export type SweepOpts = {
  limit?: number;
  concurrency?: number;
  staleAfterMs?: number;
  now?: number;
  maxRetries?: number;
  baseBackoffMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

export type SweepResult = {
  checked: number;
  /** Bookmarks whose linkCheck.ok is false after the sweep (confirmed dead). */
  dead: number;
  /** Bookmarks whose latest probe was transient/unknown (429, 5xx, network, timeout, other 4xx). */
  unknown: number;
  /** Bookmarks whose latest probe was alive. */
  alive: number;
};

type ProbeOutcome =
  | { status: "alive"; httpStatus: number }
  | { status: "dead"; httpStatus: number; reason: "client-error" }
  | {
      status: "unknown";
      httpStatus?: number;
      reason: Exclude<LinkCheckReason, never>;
    };

async function probeOnce(url: string, timeoutMs: number): Promise<ProbeOutcome> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const status = res.status;
    if (status >= 200 && status < 400) {
      return { status: "alive", httpStatus: status };
    }
    // Permanent-looking client errors: the resource is gone.
    if (status === 404 || status === 410) {
      return { status: "dead", httpStatus: status, reason: "client-error" };
    }
    // Rate limit — retryable, never dead.
    if (status === 429) {
      return { status: "unknown", httpStatus: status, reason: "rate-limited" };
    }
    // Server-side — retryable, never dead.
    if (status >= 500) {
      return { status: "unknown", httpStatus: status, reason: "server-error" };
    }
    // Other 4xx (401 auth, 403 CDN block, 451 legal, etc.). The URL may
    // still be perfectly valid for the user; do NOT flag as dead.
    return { status: "unknown", httpStatus: status, reason: "client-error" };
  } catch (err) {
    const isTimeout =
      typeof DOMException !== "undefined" &&
      err instanceof DOMException &&
      err.name === "TimeoutError";
    return { status: "unknown", reason: isTimeout ? "timeout" : "network" };
  }
}

function shouldRetry(outcome: ProbeOutcome): boolean {
  if (outcome.status === "alive" || outcome.status === "dead") return false;
  return (
    outcome.reason === "rate-limited" ||
    outcome.reason === "server-error" ||
    outcome.reason === "network" ||
    outcome.reason === "timeout"
  );
}

function utcDayStart(ts: number): number {
  return Math.floor(ts / DAY_MS) * DAY_MS;
}

function distinctFailureDayCount(log: readonly LinkCheckFailureEntry[]): number {
  const days = new Set<number>();
  for (const e of log) days.add(utcDayStart(e.at));
  return days.size;
}

export async function checkBookmark(
  bookmark: Bookmark,
  opts: CheckOpts = {},
): Promise<LinkCheckResult> {
  const checkedAt = opts.now ?? Date.now();
  const maxRetries = Math.max(0, opts.maxRetries ?? DEFAULT_MAX_RETRIES);
  const baseBackoffMs = Math.max(0, opts.baseBackoffMs ?? DEFAULT_BASE_BACKOFF_MS);
  const doSleep = opts.sleep ?? sleep;
  const timeoutMs = opts.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;

  let outcome = await probeOnce(bookmark.originalUrl, timeoutMs);
  let attempts = 1;
  while (attempts <= maxRetries && shouldRetry(outcome)) {
    // Exponential backoff: base * 2^(attempt-1). With base=1000ms:
    // 1000ms, 2000ms, 4000ms across three retries.
    const delay = baseBackoffMs * 2 ** (attempts - 1);
    if (delay > 0) await doSleep(delay);
    outcome = await probeOnce(bookmark.originalUrl, timeoutMs);
    attempts += 1;
  }
  const retries = attempts - 1;

  return mergeIntoResult(bookmark.linkCheck, outcome, checkedAt, retries);
}

function mergeIntoResult(
  prior: LinkCheckResult | undefined,
  outcome: ProbeOutcome,
  checkedAt: number,
  retries: number,
): LinkCheckResult {
  const priorLog = prior?.failureLog ?? [];

  if (outcome.status === "alive") {
    // A successful probe wipes the failure history so a URL that
    // recovers stops being "on the way to dead".
    return {
      checkedAt,
      ok: true,
      httpStatus: outcome.httpStatus,
      status: "alive",
      retries,
      failureLog: [],
      consecutiveFailureDays: 0,
    };
  }

  const entry: LinkCheckFailureEntry = {
    at: checkedAt,
    status: outcome.status,
    reason: outcome.reason,
    ...(outcome.httpStatus !== undefined ? { httpStatus: outcome.httpStatus } : {}),
  };
  const failureLog = [...priorLog, entry].slice(-FAILURE_LOG_MAX);
  const consecutiveFailureDays = distinctFailureDayCount(failureLog);
  const firstFailureAt = prior?.firstFailureAt ?? checkedAt;
  const confirmedDead = consecutiveFailureDays >= CONSECUTIVE_DAY_THRESHOLD;

  return {
    checkedAt,
    // `ok === false` is our "confirmed dead" signal for the Health
    // scanner and listDeadBookmarks. Transient failures leave ok=true
    // so a rate limit or one-day outage never surfaces as broken.
    ok: !confirmedDead,
    status: outcome.status as LinkCheckStatus,
    reason: outcome.reason,
    ...(outcome.httpStatus !== undefined ? { httpStatus: outcome.httpStatus } : {}),
    retries,
    failureLog,
    consecutiveFailureDays,
    firstFailureAt,
    lastFailureAt: checkedAt,
  };
}

export async function runDeadLinkSweep(opts: SweepOpts = {}): Promise<SweepResult> {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const concurrency = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY);
  const staleAfterMs = opts.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const now = opts.now ?? Date.now();
  const staleBefore = now - staleAfterMs;

  const checkOpts: CheckOpts = {
    now,
    ...(opts.maxRetries !== undefined ? { maxRetries: opts.maxRetries } : {}),
    ...(opts.baseBackoffMs !== undefined ? { baseBackoffMs: opts.baseBackoffMs } : {}),
    ...(opts.sleep !== undefined ? { sleep: opts.sleep } : {}),
  };

  const all = await listBookmarks();
  const candidates = all
    .filter((b) => !b.linkCheck || b.linkCheck.checkedAt < staleBefore)
    .sort((a, b) => {
      const ta = a.linkCheck?.checkedAt ?? 0;
      const tb = b.linkCheck?.checkedAt ?? 0;
      return ta - tb;
    })
    .slice(0, limit);

  let dead = 0;
  let unknown = 0;
  let alive = 0;
  for (let i = 0; i < candidates.length; i += concurrency) {
    const batch = candidates.slice(i, i + concurrency);
    const results = await Promise.all(batch.map((b) => checkBookmark(b, checkOpts)));
    for (let j = 0; j < batch.length; j++) {
      const bm = batch[j];
      const result = results[j];
      if (!result.ok) dead += 1;
      else if (result.status === "unknown") unknown += 1;
      else alive += 1;
      await updateBookmark(bm.id, { linkCheck: result });
    }
    if (i + concurrency < candidates.length && BATCH_JITTER_MS > 0) {
      const s = opts.sleep ?? sleep;
      await s(Math.random() * BATCH_JITTER_MS);
    }
  }

  return { checked: candidates.length, dead, unknown, alive };
}

export async function listDeadBookmarks(): Promise<Bookmark[]> {
  const all = await listBookmarks();
  // ok === false means confirmed dead per the consecutive-day policy.
  return all.filter((b) => b.linkCheck?.ok === false);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
