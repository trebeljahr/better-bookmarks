import type { RejectedEdgePair } from "../../shared/types";
import { getDB } from "../storage/db";

/**
 * Pair key used as the primary key in the `rejectedEdgePairs` table.
 * Ids are sorted lexicographically so a rejection covers both
 * directions (a→b and b→a) with a single row.
 */
export function pairKeyFor(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Record a user rejection for the pair (a, b). Idempotent: rejecting the
 * same pair twice keeps the original `createdAt` so callers can rely on
 * "when was this first rejected".
 */
export async function rejectEdgePair(a: string, b: string): Promise<RejectedEdgePair> {
  if (a === b) {
    throw new Error("rejectEdgePair: a and b must differ (no self-pairs)");
  }
  const db = getDB();
  const pair = pairKeyFor(a, b);
  const now = Date.now();
  return db.transaction("rw", db.rejectedEdgePairs, async () => {
    const existing = await db.rejectedEdgePairs.get(pair);
    if (existing) return existing;
    const row: RejectedEdgePair = { pair, createdAt: now };
    await db.rejectedEdgePairs.put(row);
    return row;
  });
}

export async function unrejectEdgePair(a: string, b: string): Promise<void> {
  await getDB().rejectedEdgePairs.delete(pairKeyFor(a, b));
}

export async function isEdgePairRejected(a: string, b: string): Promise<boolean> {
  if (a === b) return false;
  const row = await getDB().rejectedEdgePairs.get(pairKeyFor(a, b));
  return Boolean(row);
}

export async function listRejectedEdgePairs(): Promise<RejectedEdgePair[]> {
  return getDB().rejectedEdgePairs.toArray();
}

/**
 * Load every rejected pair as a `Set<string>` of pair keys. Used by
 * the suggester to filter candidates in a single pass without paying an
 * indexed lookup per candidate.
 */
export async function loadRejectedPairSet(): Promise<Set<string>> {
  const rows = await listRejectedEdgePairs();
  const out = new Set<string>();
  for (const row of rows) out.add(row.pair);
  return out;
}
