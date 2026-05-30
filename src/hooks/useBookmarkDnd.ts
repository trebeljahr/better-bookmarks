/**
 * useBookmarkDnd — HTML5 drag-and-drop primitives for bookmarks.
 *
 * Payload shape: { kind: "bookmarks", ids: string[], sourceTag: string | null }
 * - ids carries the dragged bookmark id(s). For bulk drags the caller passes
 *   the whole selection; otherwise just the row's own id.
 * - sourceTag is set when the drag originates from a tag chip or a sidebar
 *   tag entry; on drop the source tag is removed before the target tag is
 *   added (so dragging chip "react" onto sidebar "frontend" both removes
 *   react and adds frontend in one transaction-equivalent loop).
 *
 * MIME type is custom (`application/x-bb-bookmarks`). Falls back to
 * `text/plain` set to the first bookmark URL so users can drag bookmarks
 * out of the extension into other apps as a bonus.
 *
 * Native HTML5 DnD is sufficient here: the only drop targets are
 * non-virtualized (sidebar entries + bulk-actions bar) and multi-select
 * is handled by reading the existing bulkSelected Set at dragstart.
 * Keyboard a11y is covered by the existing j/k + x + BulkActionsBar flow.
 */

import { useCallback, useMemo } from "react";
import { dedupTags, getBookmarkById, updateBookmark } from "@/core/storage/bookmarks";
import { upsertTag } from "@/core/storage/tags";

export const BB_DND_MIME = "application/x-bb-bookmarks";
const GHOST_ID = "bb-drag-ghost";

export type DragPayload = {
  kind: "bookmarks";
  ids: string[];
  sourceTag: string | null;
};

export function serializePayload(p: DragPayload): string {
  return JSON.stringify(p);
}

export function parsePayload(raw: string | null | undefined): DragPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      parsed.kind === "bookmarks" &&
      Array.isArray(parsed.ids)
    ) {
      return {
        kind: "bookmarks",
        ids: parsed.ids.filter((x: unknown): x is string => typeof x === "string"),
        sourceTag: typeof parsed.sourceTag === "string" ? parsed.sourceTag : null,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function removeGhost(): void {
  if (typeof document === "undefined") return;
  const existing = document.getElementById(GHOST_ID);
  if (existing?.parentNode) existing.parentNode.removeChild(existing);
}

function makeGhost(label: string, count: number): HTMLElement {
  removeGhost();
  const el = document.createElement("div");
  el.id = GHOST_ID;
  el.textContent = count > 1 ? `${count} bookmarks` : label;
  el.style.position = "fixed";
  el.style.top = "-9999px";
  el.style.left = "-9999px";
  el.style.padding = "4px 8px";
  el.style.borderRadius = "6px";
  el.style.background = "var(--card, white)";
  el.style.color = "var(--card-foreground, black)";
  el.style.border = "1px solid var(--border, #ddd)";
  el.style.font = "12px system-ui, sans-serif";
  el.style.maxWidth = "240px";
  el.style.overflow = "hidden";
  el.style.whiteSpace = "nowrap";
  el.style.textOverflow = "ellipsis";
  el.style.pointerEvents = "none";
  el.style.zIndex = "9999";
  document.body.appendChild(el);
  return el;
}

export type DragSourceOptions = {
  getIds: () => string[];
  /** Tag this drag is "leaving". When set and != target, the drop removes it. */
  sourceTag?: string | null;
  /** Single-row label for the ghost (truncated, ignored for multi-drag). */
  label: string;
  /** Convenience: when present, mirrored into text/plain for cross-app drags. */
  firstUrl?: string;
};

export function useBookmarkDragSource(opts: DragSourceOptions): {
  draggable: true;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
} {
  const { getIds, sourceTag = null, label, firstUrl } = opts;
  const onDragStart = useCallback(
    (e: React.DragEvent) => {
      const ids = getIds();
      if (ids.length === 0) {
        e.preventDefault();
        return;
      }
      const payload: DragPayload = { kind: "bookmarks", ids, sourceTag };
      e.dataTransfer.setData(BB_DND_MIME, serializePayload(payload));
      if (firstUrl) e.dataTransfer.setData("text/plain", firstUrl);
      e.dataTransfer.effectAllowed = "copyMove";
      const ghost = makeGhost(label, ids.length);
      try {
        e.dataTransfer.setDragImage(ghost, 10, 10);
      } catch {
        // setDragImage can fail in test environments; ignore.
      }
      // Defensive cleanup if dragend never fires (drop outside window).
      setTimeout(removeGhost, 1500);
    },
    [getIds, sourceTag, label, firstUrl],
  );
  const onDragEnd = useCallback(() => removeGhost(), []);
  return { draggable: true, onDragStart, onDragEnd };
}

/**
 * Apply a drop payload to a target tag. Removes payload.sourceTag (if set
 * and different from target) and adds the target tag. Idempotent.
 *
 * Returns the number of bookmarks actually modified.
 */
export async function applyDrop(payload: DragPayload, targetTag: string): Promise<number> {
  const target = targetTag.trim();
  if (!target) return 0;
  const targetLower = target.toLowerCase();
  const source = payload.sourceTag?.trim() ?? null;
  const sourceLower = source ? source.toLowerCase() : null;
  if (sourceLower !== null && sourceLower === targetLower) return 0;

  await upsertTag({ name: target });
  let changed = 0;
  for (const id of payload.ids) {
    const b = await getBookmarkById(id);
    if (!b) continue;
    const withoutSource =
      sourceLower !== null ? b.tags.filter((t) => t.toLowerCase() !== sourceLower) : b.tags;
    const next = dedupTags([...withoutSource, target]);
    // Skip if nothing actually changed.
    if (next.length === b.tags.length && next.every((t, i) => t === b.tags[i])) continue;
    await updateBookmark(id, { tags: next });
    changed += 1;
  }
  return changed;
}

/** Drop into the "Untagged" virtual entry: removes the source tag if any. */
export async function applyUntaggedDrop(payload: DragPayload): Promise<number> {
  let changed = 0;
  for (const id of payload.ids) {
    const b = await getBookmarkById(id);
    if (!b) continue;
    if (b.tags.length === 0) continue;
    await updateBookmark(id, { tags: [] });
    changed += 1;
  }
  return changed;
}

type DropTargetHandlers = {
  onDragEnter: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  "data-drop-target": string;
};

function hasBookmarkPayload(e: React.DragEvent): boolean {
  const types = e.dataTransfer?.types;
  if (!types) return false;
  for (let i = 0; i < types.length; i++) {
    if (types[i] === BB_DND_MIME) return true;
  }
  return false;
}

function buildHighlightHandlers(
  kind: string,
  onDrop: (e: React.DragEvent) => void,
): DropTargetHandlers {
  return {
    "data-drop-target": kind,
    onDragEnter: (e) => {
      if (!hasBookmarkPayload(e)) return;
      e.preventDefault();
      (e.currentTarget as HTMLElement).dataset.dragOver = "true";
    },
    onDragOver: (e) => {
      if (!hasBookmarkPayload(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    },
    onDragLeave: (e) => {
      delete (e.currentTarget as HTMLElement).dataset.dragOver;
    },
    onDrop: (e) => {
      const el = e.currentTarget as HTMLElement;
      delete el.dataset.dragOver;
      if (!hasBookmarkPayload(e)) return;
      e.preventDefault();
      removeGhost();
      onDrop(e);
    },
  };
}

export type TagDropTargetOptions = {
  onDropped?: (changed: number) => void;
};

export function useTagDropTarget(
  targetTag: string,
  opts: TagDropTargetOptions = {},
): DropTargetHandlers {
  const onDropped = opts.onDropped;
  return useMemo(
    () =>
      buildHighlightHandlers("tag", (e) => {
        const payload = parsePayload(e.dataTransfer.getData(BB_DND_MIME));
        if (!payload) return;
        void applyDrop(payload, targetTag).then((n) => onDropped?.(n));
      }),
    [targetTag, onDropped],
  );
}

export function useUntaggedDropTarget(opts: TagDropTargetOptions = {}): DropTargetHandlers {
  const onDropped = opts.onDropped;
  return useMemo(
    () =>
      buildHighlightHandlers("untagged", (e) => {
        const payload = parsePayload(e.dataTransfer.getData(BB_DND_MIME));
        if (!payload) return;
        void applyUntaggedDrop(payload).then((n) => onDropped?.(n));
      }),
    [onDropped],
  );
}

/** Drop onto BulkActionsBar = add dropped ids to current bulk selection. */
export type BulkSelectDropTargetOptions = {
  onAddIds: (ids: string[]) => void;
};

export function useBulkSelectDropTarget(opts: BulkSelectDropTargetOptions): DropTargetHandlers {
  const { onAddIds } = opts;
  return useMemo(
    () =>
      buildHighlightHandlers("bulk", (e) => {
        const payload = parsePayload(e.dataTransfer.getData(BB_DND_MIME));
        if (!payload) return;
        onAddIds(payload.ids);
      }),
    [onAddIds],
  );
}
