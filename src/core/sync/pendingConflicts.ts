import { ulid } from "@/core/util/ulid";
import { getDB } from "../storage/db";

/**
 * D2 `ask` conflict-policy fallback (see docs/DECISIONS.md D2). When the
 * user selects `conflictPolicy: "ask"` and an inbound Chrome edit disagrees
 * with the store on a per-field basis, the sync handler enqueues one row
 * here per bookmark. `ConflictResolverModal` on the overview page reads
 * the queue and lets the user pick a winning side per field.
 *
 * `chromeSide` / `storeSide` capture BOTH values at enqueue time so the
 * modal can render a per-field diff without re-reading a state that may
 * have moved on. `fields` lists which fields are actually in conflict —
 * the modal only shows radios for those.
 */
export type ConflictField = "title" | "url";
export type ConflictSource = "chrome" | "store";

export type ConflictSide = {
  title: string;
  url: string;
};

export type PendingConflictRow = {
  id: string;
  bookmarkId: string;
  chromeSide: ConflictSide;
  storeSide: ConflictSide;
  fields: ConflictField[];
  enqueuedAt: number;
};

export type EnqueueConflictInput = {
  bookmarkId: string;
  chromeSide: ConflictSide;
  storeSide: ConflictSide;
  fields: ConflictField[];
  enqueuedAt?: number;
};

/**
 * Insert a pending conflict for a bookmark, replacing any prior row for
 * the same bookmark. Coalescing keeps the queue bounded when the same
 * field flip-flops repeatedly upstream in Chrome before the user resolves.
 */
export async function enqueueConflict(input: EnqueueConflictInput): Promise<PendingConflictRow> {
  const db = getDB();
  const enqueuedAt = input.enqueuedAt ?? Date.now();
  return db.transaction("rw", db.pendingConflicts, async () => {
    const priors = await db.pendingConflicts.where("bookmarkId").equals(input.bookmarkId).toArray();
    if (priors.length > 0) {
      await db.pendingConflicts.bulkDelete(priors.map((p) => p.id));
    }
    const row: PendingConflictRow = {
      id: ulid(enqueuedAt),
      bookmarkId: input.bookmarkId,
      chromeSide: { ...input.chromeSide },
      storeSide: { ...input.storeSide },
      fields: [...input.fields],
      enqueuedAt,
    };
    await db.pendingConflicts.put(row);
    return row;
  });
}

/** Oldest-first queue view — the modal resolves them one at a time. */
export async function listPendingConflicts(): Promise<PendingConflictRow[]> {
  return getDB().pendingConflicts.orderBy("enqueuedAt").toArray();
}

export async function getPendingConflictByBookmarkId(
  bookmarkId: string,
): Promise<PendingConflictRow | undefined> {
  return getDB().pendingConflicts.where("bookmarkId").equals(bookmarkId).first();
}

export async function deletePendingConflict(id: string): Promise<void> {
  await getDB().pendingConflicts.delete(id);
}

export async function clearPendingConflicts(): Promise<void> {
  await getDB().pendingConflicts.clear();
}
