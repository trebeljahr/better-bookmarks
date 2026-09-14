/**
 * Actions the UI takes against a background-suggested (`auto-*`) edge.
 *
 * Accept upgrades the edge in place — the row keeps its id and endpoints,
 * only `source` flips to `manual` (and `strength` / `sourceRules` are
 * cleared, since those are meaningful only for auto rows and would go
 * stale the moment a human confirmed the edge). The suggester itself
 * skips manual pairs, so the promoted edge will never resurface as a
 * suggestion.
 *
 * Reject deletes the auto edge and records the pair in
 * `rejectedEdgePairs`, so the next sweep skips it forever (until the
 * user explicitly un-rejects).
 */

import type { Edge } from "../../shared/types";
import { getDB } from "../storage/db";
import { rejectEdgePair } from "./rejected";

/**
 * Flip an auto edge to `source: "manual"`, preserving id/endpoints/type
 * so the connections list picks it up seamlessly. A no-op on an edge
 * that is already manual. Throws if the id is unknown.
 */
export async function acceptAutoEdge(edgeId: string): Promise<Edge> {
  const db = getDB();
  return db.transaction("rw", db.edges, async () => {
    const existing = await db.edges.get(edgeId);
    if (!existing) throw new Error(`acceptAutoEdge: edge ${edgeId} not found`);
    if (existing.source === "manual") return existing;
    const upgraded: Edge = {
      ...existing,
      source: "manual",
      strength: undefined,
      sourceRules: undefined,
    };
    await db.edges.put(upgraded);
    return upgraded;
  });
}

/**
 * Delete an auto edge and blacklist its pair so the background sweep
 * (and the read-side suggester) never resurface it. The rejection is
 * order-independent — `pairKeyFor` sorts the two ids.
 */
export async function rejectAutoEdge(edge: Pick<Edge, "id" | "fromId" | "toId">): Promise<void> {
  const db = getDB();
  await db.transaction("rw", db.edges, db.rejectedEdgePairs, async () => {
    await db.edges.delete(edge.id);
  });
  // rejectEdgePair opens its own transaction — call it outside the
  // combined tx above so a Dexie transaction-scoping mismatch can't
  // trip it. The two writes are logically ordered (delete first) but
  // don't need atomicity: if the second write fails the pair simply
  // becomes eligible again, which the next sweep will surface for a
  // second reject.
  await rejectEdgePair(edge.fromId, edge.toId);
}

/**
 * Batch-accept every edge id in `edgeIds`. Runs the upgrades in a single
 * `rw` transaction so a mid-batch failure leaves nothing half-flipped.
 * Missing edges are silently skipped — the batch is typically driven
 * from a stale UI snapshot and dropped rows should not fail the whole
 * call.
 */
export async function acceptAutoEdges(edgeIds: readonly string[]): Promise<{ upgraded: number }> {
  if (edgeIds.length === 0) return { upgraded: 0 };
  const db = getDB();
  return db.transaction("rw", db.edges, async () => {
    let upgraded = 0;
    const writes: Edge[] = [];
    for (const id of edgeIds) {
      const existing = await db.edges.get(id);
      if (!existing) continue;
      if (existing.source === "manual") continue;
      writes.push({
        ...existing,
        source: "manual",
        strength: undefined,
        sourceRules: undefined,
      });
      upgraded++;
    }
    if (writes.length > 0) await db.edges.bulkPut(writes);
    return { upgraded };
  });
}
