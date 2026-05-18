import type { Bookmark, LinkCheckResult } from "../../shared/types";
import { listBookmarks, updateBookmark } from "../storage/bookmarks";

const DEFAULT_LIMIT = 50;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;
const BATCH_JITTER_MS = 100;

export type SweepOpts = {
  limit?: number;
  concurrency?: number;
  staleAfterMs?: number;
  now?: number;
};

export type SweepResult = {
  checked: number;
  dead: number;
};

export async function checkBookmark(bookmark: Bookmark): Promise<LinkCheckResult> {
  const checkedAt = Date.now();
  try {
    const res = await fetch(bookmark.originalUrl, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const status = res.status;
    if (status >= 200 && status < 400) {
      return { checkedAt, ok: true, httpStatus: status };
    }
    if (status >= 400 && status < 500) {
      return { checkedAt, ok: false, httpStatus: status, reason: "client-error" };
    }
    return { checkedAt, ok: false, httpStatus: status, reason: "server-error" };
  } catch {
    return { checkedAt, ok: false, reason: "network" };
  }
}

export async function runDeadLinkSweep(opts: SweepOpts = {}): Promise<SweepResult> {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const concurrency = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY);
  const staleAfterMs = opts.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const now = opts.now ?? Date.now();
  const staleBefore = now - staleAfterMs;

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
  for (let i = 0; i < candidates.length; i += concurrency) {
    const batch = candidates.slice(i, i + concurrency);
    const results = await Promise.all(batch.map((b) => checkBookmark(b)));
    for (let j = 0; j < batch.length; j++) {
      const bm = batch[j];
      const result = results[j];
      if (!result.ok) dead += 1;
      await updateBookmark(bm.id, { linkCheck: result });
    }
    if (i + concurrency < candidates.length && BATCH_JITTER_MS > 0) {
      await sleep(Math.random() * BATCH_JITTER_MS);
    }
  }

  return { checked: candidates.length, dead };
}

export async function listDeadBookmarks(): Promise<Bookmark[]> {
  const all = await listBookmarks();
  return all.filter((b) => b.linkCheck?.ok === false);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
