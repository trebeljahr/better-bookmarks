import { ulid } from "@/core/util/ulid";
import type { Edge, EdgeSource, EdgeType } from "../../shared/types";
import { getDB } from "../storage/db";

export type CreateEdgeInput = {
  fromId: string;
  toId: string;
  type: EdgeType;
  note?: string;
  directed?: boolean;
  source?: EdgeSource;
};

export type ListEdgesForOptions = {
  /**
   * When true, include suggested (non-manual) edges. Default: false — only
   * `source === "manual"` edges are returned.
   */
  includeSuggested?: boolean;
};

/**
 * Create a new edge. If an edge with the same (fromId, toId, type) already
 * exists in the store, returns that existing edge instead of writing a new
 * one (idempotent).
 *
 * Note: dedup is order-sensitive on (fromId, toId). An undirected edge
 * a->b and a directed b->a are distinct rows by design — the
 * suggester takes care to not propose pairs that already have a manual
 * link in either direction.
 */
export async function createEdge(input: CreateEdgeInput): Promise<Edge> {
  if (input.fromId === input.toId) {
    throw new Error("createEdge: fromId and toId must differ (no self-edges)");
  }
  const db = getDB();
  const now = Date.now();
  return db.transaction("rw", db.edges, async () => {
    const existing = await db.edges
      .where("fromId")
      .equals(input.fromId)
      .and((e) => e.toId === input.toId && e.type === input.type)
      .first();
    if (existing) return existing;

    const edge: Edge = {
      id: ulid(now),
      fromId: input.fromId,
      toId: input.toId,
      type: input.type,
      note: input.note ?? "",
      directed: input.directed ?? false,
      createdAt: now,
      source: input.source ?? "manual",
    };
    await db.edges.put(edge);
    return edge;
  });
}

export async function deleteEdge(id: string): Promise<void> {
  await getDB().edges.delete(id);
}

/**
 * Return every edge incident to `bookmarkId` regardless of `directed`. By
 * default only manual edges are returned; pass `{ includeSuggested: true }`
 * to also include `auto-*` rows.
 */
export async function listEdgesFor(
  bookmarkId: string,
  opts: ListEdgesForOptions = {},
): Promise<Edge[]> {
  const db = getDB();
  const fromSide = await db.edges.where("fromId").equals(bookmarkId).toArray();
  const toSide = await db.edges.where("toId").equals(bookmarkId).toArray();

  const merged = new Map<string, Edge>();
  for (const edge of fromSide) merged.set(edge.id, edge);
  for (const edge of toSide) merged.set(edge.id, edge);

  const all = Array.from(merged.values());
  if (opts.includeSuggested) return all;
  return all.filter((e) => e.source === "manual");
}

export async function listAllEdges(): Promise<Edge[]> {
  return getDB().edges.toArray();
}

/**
 * Look up an existing edge between `a` and `b` (in either direction) of the
 * given type with `source === "manual"`. Used by the suggester to filter
 * out pairs that the user has already linked.
 */
export async function findManualEdgeBetween(
  a: string,
  b: string,
  type?: EdgeType,
): Promise<Edge | undefined> {
  const db = getDB();
  const candidates = await db.edges
    .where("fromId")
    .anyOf([a, b])
    .filter((e) => (e.fromId === a && e.toId === b) || (e.fromId === b && e.toId === a))
    .filter((e) => e.source === "manual")
    .filter((e) => (type ? e.type === type : true))
    .toArray();
  return candidates[0];
}
