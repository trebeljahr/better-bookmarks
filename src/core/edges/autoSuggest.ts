/**
 * Auto-edge suggester (D13).
 *
 * Runs on a background alarm and walks bookmark pairs (a, b) with
 * `a.id < b.id`, persisting an `auto-*` edge whenever a pair passes the
 * D13 threshold. Existing auto edges are upgraded when a fresh scan
 * produces a strictly higher `strength`; never downgraded. Manual edges
 * and user-rejected pairs are always skipped.
 *
 * The walk is chunked — one alarm tick processes at most
 * `pairsPerTick` pairs and stores a cursor in `chrome.storage.local`
 * so the next tick resumes from the following pair. The cursor holds
 * the last `(aId, bId)` we visited; a stale cursor (bookmark deleted)
 * jumps to the next id ≥ the cursor. When the last pair is reached the
 * cursor is cleared, so the next tick starts a fresh full sweep.
 */

import { ulid } from "@/core/util/ulid";
import type { Bookmark, Edge, EdgeSource } from "../../shared/types";
import { listBookmarks } from "../storage/bookmarks";
import { getDB } from "../storage/db";
import { getSettings } from "../storage/settings";
import { listAllEdges } from "./crud";
import { loadRejectedPairSet, pairKeyFor } from "./rejected";

export const AUTO_EDGE_SUGGEST_ALARM_NAME = "bb:edge-auto-suggest";

/**
 * chrome.storage.local key for the pair-scan cursor. Set to the last
 * `(aId, bId)` processed; cleared (removed) when a full sweep completes.
 */
export const AUTO_EDGE_SUGGEST_CURSOR_KEY = "__bb_auto_edge_suggest_cursor__";

/**
 * Pairs processed per alarm tick. All in-memory work, but capped so a
 * single tick stays snappy and yields to the SW event loop.
 */
export const DEFAULT_PAIRS_PER_TICK = 5000;

export type AutoSuggestCursor = {
  aId: string;
  bId: string;
};

export type AutoSuggestSweepResult = {
  pairsScanned: number;
  candidatesWritten: number;
  candidatesUpgraded: number;
  cursor: AutoSuggestCursor | null;
  completed: boolean;
};

export type EvaluatePairInput = {
  a: Pick<Bookmark, "domain" | "tags" | "title" | "note">;
  b: Pick<Bookmark, "domain" | "tags" | "title" | "note">;
};

export type EvaluatePairResult = {
  passes: boolean;
  strength: number;
  sourceRules: string[];
  sharedTags: string[];
  sharedDomain: boolean;
  textSimilarity: number;
};

/**
 * Decide whether a pair passes the D13 threshold and compute its
 * strength score. Pure function — no DB or chrome deps — so the
 * threshold + strength math is trivially testable in isolation.
 *
 * threshold:  (sharedTags ≥ 1 AND sharedDomain) OR sharedTags ≥ 2
 * strength:   0.4 · min(1, sharedTags/3)
 *           + 0.3 · (sharedDomain ? 1 : 0)
 *           + 0.3 · jaccard3gram(a.title+' '+a.note, b.title+' '+b.note)
 */
export function evaluatePair(input: EvaluatePairInput): EvaluatePairResult {
  const { a, b } = input;
  const sharedTags = intersectTags(a.tags, b.tags);
  const sharedDomain = Boolean(a.domain) && a.domain === b.domain;
  const passes = (sharedTags.length >= 1 && sharedDomain) || sharedTags.length >= 2;

  const textA = `${a.title ?? ""} ${a.note ?? ""}`;
  const textB = `${b.title ?? ""} ${b.note ?? ""}`;
  const textSimilarity = jaccard3gram(textA, textB);

  const tagScore = 0.4 * Math.min(1, sharedTags.length / 3);
  const domainScore = sharedDomain ? 0.3 : 0;
  const textScore = 0.3 * textSimilarity;
  const strength = round4(tagScore + domainScore + textScore);

  const sourceRules: string[] = [];
  for (const tag of sharedTags) sourceRules.push(`sharedTag:${tag}`);
  if (sharedDomain) sourceRules.push("sharedDomain");
  if (textSimilarity > 0) sourceRules.push(`textSimilarity:${textSimilarity.toFixed(2)}`);

  return {
    passes,
    strength,
    sourceRules,
    sharedTags,
    sharedDomain,
    textSimilarity,
  };
}

/**
 * Jaccard similarity over character 3-grams. Whitespace-normalized,
 * lowercased. Strings shorter than 3 chars have an empty trigram set,
 * so a pair of empty texts returns 0 rather than the mathematical
 * NaN / 1 corner case.
 */
export function jaccard3gram(a: string, b: string): number {
  const gramsA = trigramSet(a);
  const gramsB = trigramSet(b);
  if (gramsA.size === 0 || gramsB.size === 0) return 0;
  let intersection = 0;
  for (const g of gramsA) if (gramsB.has(g)) intersection++;
  const union = gramsA.size + gramsB.size - intersection;
  if (union === 0) return 0;
  return intersection / union;
}

function trigramSet(raw: string): Set<string> {
  const normalized = (raw ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  const out = new Set<string>();
  if (normalized.length < 3) return out;
  for (let i = 0; i <= normalized.length - 3; i++) {
    out.add(normalized.slice(i, i + 3));
  }
  return out;
}

function intersectTags(rawA: readonly string[], rawB: readonly string[]): string[] {
  const setB = new Set<string>();
  for (const t of rawB) {
    const k = t.trim().toLowerCase();
    if (k) setB.add(k);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of rawA) {
    const k = t.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    if (setB.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  out.sort((x, y) => x.localeCompare(y));
  return out;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

async function loadCursor(): Promise<AutoSuggestCursor | null> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return null;
  const result = await chrome.storage.local.get(AUTO_EDGE_SUGGEST_CURSOR_KEY);
  const stored = result[AUTO_EDGE_SUGGEST_CURSOR_KEY] as AutoSuggestCursor | undefined;
  if (!stored || typeof stored.aId !== "string" || typeof stored.bId !== "string") return null;
  return stored;
}

async function saveCursor(cursor: AutoSuggestCursor | null): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return;
  if (cursor) {
    await chrome.storage.local.set({ [AUTO_EDGE_SUGGEST_CURSOR_KEY]: cursor });
  } else {
    await chrome.storage.local.remove(AUTO_EDGE_SUGGEST_CURSOR_KEY);
  }
}

/**
 * Test-only: reset the persisted cursor so the next sweep starts from
 * the first pair.
 */
export async function resetAutoEdgeSuggestCursor(): Promise<void> {
  await saveCursor(null);
}

export type RunAutoEdgeSuggestOpts = {
  pairsPerTick?: number;
  now?: () => number;
};

/**
 * One tick of the pair-scan. Processes up to `pairsPerTick` pairs
 * from the persisted cursor, writes new auto edges (or upgrades
 * lower-strength ones), and stores the new cursor for the next tick.
 * Manual edges and user-rejected pairs short-circuit before evaluation.
 *
 * The scan iterates over bookmarks sorted by id ascending, visiting
 * every pair (i, j) with i < j. That gives `a.id < b.id` as the task
 * requires and produces a stable order for cursor resume.
 */
export async function runAutoEdgeSuggestSweep(
  opts: RunAutoEdgeSuggestOpts = {},
): Promise<AutoSuggestSweepResult> {
  const pairsPerTick = Math.max(1, opts.pairsPerTick ?? DEFAULT_PAIRS_PER_TICK);
  const now = opts.now ?? (() => Date.now());

  const bookmarks = await listBookmarks();
  const sorted = [...bookmarks].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const N = sorted.length;
  if (N < 2) {
    await saveCursor(null);
    return {
      pairsScanned: 0,
      candidatesWritten: 0,
      candidatesUpgraded: 0,
      cursor: null,
      completed: true,
    };
  }

  const [rejected, allEdges, cursor] = await Promise.all([
    loadRejectedPairSet(),
    listAllEdges(),
    loadCursor(),
  ]);

  const manualPairs = new Set<string>();
  const autoByPair = new Map<string, Edge>();
  for (const e of allEdges) {
    const key = pairKeyFor(e.fromId, e.toId);
    if (e.source === "manual") {
      manualPairs.add(key);
      continue;
    }
    // Track the best-existing auto edge per pair so we can upgrade
    // rather than duplicate. Multiple auto rows per pair should not
    // happen, but we defensively keep the strongest.
    const prev = autoByPair.get(key);
    if (!prev || (e.strength ?? 0) > (prev.strength ?? 0)) {
      autoByPair.set(key, e);
    }
  }

  const start = resumeIndicesFromCursor(sorted, cursor);

  let pairsScanned = 0;
  let candidatesWritten = 0;
  let candidatesUpgraded = 0;
  let lastPair: AutoSuggestCursor | null = null;
  let broke = false;
  const writes: Edge[] = [];

  outer: for (let i = start.i; i < N; i++) {
    const jStart = i === start.i && start.j > i ? start.j : i + 1;
    for (let k = jStart; k < N; k++) {
      const a = sorted[i];
      const b = sorted[k];
      pairsScanned++;
      lastPair = { aId: a.id, bId: b.id };

      const key = pairKeyFor(a.id, b.id);
      const skip = manualPairs.has(key) || rejected.has(key);
      if (!skip) {
        const ev = evaluatePair({ a, b });
        if (ev.passes) {
          const existing = autoByPair.get(key);
          const source: EdgeSource = pickSource(ev);
          if (!existing) {
            const ts = now();
            writes.push({
              id: ulid(ts),
              fromId: a.id,
              toId: b.id,
              type: "related",
              note: "",
              directed: false,
              createdAt: ts,
              source,
              strength: ev.strength,
              sourceRules: ev.sourceRules,
            });
            candidatesWritten++;
          } else if (ev.strength > (existing.strength ?? 0)) {
            writes.push({
              ...existing,
              source,
              strength: ev.strength,
              sourceRules: ev.sourceRules,
            });
            candidatesUpgraded++;
          }
          // else: leave the existing edge in place (never downgrade).
        }
      }

      if (pairsScanned >= pairsPerTick) {
        broke = true;
        break outer;
      }
    }
  }

  const isTerminalPair =
    lastPair !== null && lastPair.aId === sorted[N - 2].id && lastPair.bId === sorted[N - 1].id;
  const completed = !broke || isTerminalPair;

  if (writes.length > 0) {
    const db = getDB();
    await db.transaction("rw", db.edges, async () => {
      await db.edges.bulkPut(writes);
    });
  }

  const nextCursor = completed ? null : lastPair;
  await saveCursor(nextCursor);

  return {
    pairsScanned,
    candidatesWritten,
    candidatesUpgraded,
    cursor: nextCursor,
    completed,
  };
}

function pickSource(ev: EvaluatePairResult): EdgeSource {
  if (ev.sharedTags.length > 0) return "auto-tag";
  if (ev.sharedDomain) return "auto-domain";
  return "auto-tag";
}

/**
 * Translate a persisted `(aId, bId)` cursor into `(i, j)` indices into
 * the current sorted-by-id bookmark list. Resumes strictly after the
 * cursor pair. Handles deletions: if `aId` is gone we jump to the first
 * id ≥ it; if `bId` is gone we resume at the first id > it within the
 * same `a` row.
 */
function resumeIndicesFromCursor(
  sorted: readonly Bookmark[],
  cursor: AutoSuggestCursor | null,
): { i: number; j: number } {
  if (!cursor) return { i: 0, j: 1 };
  const N = sorted.length;

  // Find the first index whose id >= cursor.aId.
  const iIdx = lowerBound(sorted, cursor.aId);
  if (iIdx >= N) return { i: N, j: 0 };

  if (sorted[iIdx].id === cursor.aId) {
    // aId still present — resume with the pair *after* (aId, bId).
    // Find the first index > iIdx whose id > cursor.bId.
    let jIdx = lowerBound(sorted, cursor.bId);
    if (jIdx <= iIdx) jIdx = iIdx + 1;
    if (jIdx < N && sorted[jIdx].id === cursor.bId) jIdx++;
    if (jIdx >= N) return { i: iIdx + 1, j: iIdx + 2 };
    return { i: iIdx, j: jIdx };
  }

  // aId was deleted; the next surviving id (iIdx) becomes the new `a`
  // and we start its inner loop at iIdx + 1.
  return { i: iIdx, j: iIdx + 1 };
}

function lowerBound(sorted: readonly Bookmark[], id: string): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid].id < id) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Install (or refresh) the auto-suggest alarm based on current
 * settings. No-op + clears any existing alarm when the setting is off.
 * Idempotent — safe to call on every SW boot.
 */
export async function installAutoEdgeSuggestAlarm(): Promise<void> {
  const settings = await getSettings();
  if (!settings.autoEdgeSuggestEnabled) {
    try {
      await chrome.alarms.clear(AUTO_EDGE_SUGGEST_ALARM_NAME);
    } catch (err) {
      console.warn("installAutoEdgeSuggestAlarm: clear failed", err);
    }
    return;
  }
  const periodInMinutes = settings.autoEdgeSuggestIntervalMin || 720;
  chrome.alarms.create(AUTO_EDGE_SUGGEST_ALARM_NAME, { periodInMinutes });
}

/**
 * Alarm handler entrypoint: reads settings, no-ops when disabled,
 * otherwise runs one chunk of the pair scan.
 */
export async function runAutoEdgeSuggestSweepIfEnabled(): Promise<AutoSuggestSweepResult | null> {
  const settings = await getSettings();
  if (!settings.autoEdgeSuggestEnabled) return null;
  return runAutoEdgeSuggestSweep();
}
