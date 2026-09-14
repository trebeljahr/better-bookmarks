import type { Bookmark } from "../../shared/types";
import { canonicalize } from "../canonicalizer";
import { getBookmarkById, updateBookmark } from "../storage/bookmarks";
import { setFieldPolicy } from "./conflictPolicyCache";
import {
  type ConflictField,
  type ConflictSource,
  deletePendingConflict,
  type PendingConflictRow,
} from "./pendingConflicts";

export type ResolvePendingConflictInput = {
  conflict: PendingConflictRow;
  /** Per-field winning side chosen by the user. Every field in `conflict.fields` must appear. */
  choices: Record<ConflictField, ConflictSource>;
  /** For each field, whether to seed the 24h per-field policy cache with the chosen side. */
  applyToFuture?: Partial<Record<ConflictField, boolean>>;
  now?: number;
};

export type ResolvePendingConflictResult = {
  applied: boolean;
  patch: Partial<Bookmark>;
};

/**
 * Apply the user's choice from `ConflictResolverModal` to the store,
 * clear the pending conflict row, and (when requested) seed the 24h
 * per-field policy cache so subsequent inbound Chrome events resolve
 * silently in the same direction.
 *
 * If the bookmark has since been deleted the row is still cleared but
 * no patch is applied. Choosing "store" for a field is a no-op patch —
 * we still record the cache directive when `applyToFuture[field]` is set
 * so the user's intent survives.
 */
export async function resolvePendingConflict(
  input: ResolvePendingConflictInput,
): Promise<ResolvePendingConflictResult> {
  const { conflict, choices, applyToFuture, now = Date.now() } = input;

  const patch: Partial<Bookmark> = {};
  for (const field of conflict.fields) {
    const source = choices[field];
    if (!source) continue;
    if (source === "chrome") {
      if (field === "title") {
        patch.title = conflict.chromeSide.title;
      } else if (field === "url") {
        const c = canonicalize(conflict.chromeSide.url);
        if (c.ok) {
          patch.originalUrl = conflict.chromeSide.url;
          patch.canonicalUrl = c.canonical;
          patch.domain = c.domain;
        }
      }
    } else if (source === "store") {
      // Explicit "keep store": no patch, but the store may have moved on
      // since enqueue — we do not clobber it back to the enqueue snapshot.
    }
  }

  const existing = await getBookmarkById(conflict.bookmarkId);
  let applied = false;
  if (existing && Object.keys(patch).length > 0) {
    await updateBookmark(conflict.bookmarkId, patch as Partial<Bookmark>);
    applied = true;
  }

  await deletePendingConflict(conflict.id);

  if (applyToFuture) {
    for (const field of conflict.fields) {
      if (!applyToFuture[field]) continue;
      const source = choices[field];
      if (!source) continue;
      await setFieldPolicy(field, source, now);
    }
  }

  return { applied, patch };
}
