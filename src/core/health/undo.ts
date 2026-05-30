/**
 * 30s undo buffer for Health actions.
 *
 * Snapshots are held in memory only — we do NOT persist across page
 * reloads (per spec). On a reload the user has already moved on. The
 * buffer keeps at most one snapshot per id and auto-expires the
 * snapshot after `expiresAt`.
 *
 * The Chrome side is one-way: if a merge pushed `chrome.bookmarks.remove`
 * to Chrome, undo restores the local store but cannot resurrect the
 * Chrome node. We surface that caveat in the merge confirmation copy.
 */

import type { Bookmark, ChromeMapping, Tag } from "../../shared/types";
import { ulid } from "../util/ulid";

export type UndoTagDelta = {
  name: string;
  before: Tag | null;
  after: Tag | null;
};

export type UndoSnapshot = {
  id: string;
  createdAt: number;
  expiresAt: number;
  label: string;
  bookmarks: Bookmark[];
  chromeMappings: ChromeMapping[];
  tagDeltas: UndoTagDelta[];
};

export type UndoBufferOpts = {
  /** TTL in ms; defaults to 30s per spec. */
  ttlMs?: number;
  now?: () => number;
};

/**
 * Tiny in-memory snapshot store. Tests can call `setNow` to drive the
 * clock deterministically. Production callers just `push` / `pop`.
 */
export class UndoBuffer {
  private snapshots = new Map<string, UndoSnapshot>();
  private readonly ttlMs: number;
  private now: () => number;
  private listeners = new Set<() => void>();

  constructor(opts: UndoBufferOpts = {}) {
    this.ttlMs = opts.ttlMs ?? 30_000;
    this.now = opts.now ?? Date.now;
  }

  /** Subscribe to mutations. Returns an unsubscribe handle. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Create a snapshot and store it. Returns the snapshot id. */
  push(input: {
    label: string;
    bookmarks: Bookmark[];
    chromeMappings: ChromeMapping[];
    tagDeltas: UndoTagDelta[];
  }): UndoSnapshot {
    const createdAt = this.now();
    const snapshot: UndoSnapshot = {
      id: ulid(),
      createdAt,
      expiresAt: createdAt + this.ttlMs,
      label: input.label,
      bookmarks: input.bookmarks,
      chromeMappings: input.chromeMappings,
      tagDeltas: input.tagDeltas,
    };
    this.snapshots.set(snapshot.id, snapshot);
    this.notify();
    return snapshot;
  }

  /** Remove and return a snapshot. */
  pop(id: string): UndoSnapshot | undefined {
    const snap = this.snapshots.get(id);
    if (!snap) return undefined;
    this.snapshots.delete(id);
    this.notify();
    return snap;
  }

  /** Look up without removing. */
  peek(id: string): UndoSnapshot | undefined {
    return this.snapshots.get(id);
  }

  /** Drop any snapshots whose `expiresAt` is in the past. */
  pruneExpired(): UndoSnapshot[] {
    const now = this.now();
    const dropped: UndoSnapshot[] = [];
    for (const [id, snap] of this.snapshots.entries()) {
      if (snap.expiresAt <= now) {
        this.snapshots.delete(id);
        dropped.push(snap);
      }
    }
    if (dropped.length > 0) this.notify();
    return dropped;
  }

  /** All currently active snapshots, newest first. */
  list(): UndoSnapshot[] {
    return [...this.snapshots.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  /** Reset the clock — test helper. */
  setNow(fn: () => number): void {
    this.now = fn;
  }

  private notify(): void {
    for (const l of this.listeners) {
      try {
        l();
      } catch (err) {
        console.error("[health/undo] listener threw", err);
      }
    }
  }
}

/** Module-level singleton used by the UI. Tests can construct their own. */
export const undoBuffer = new UndoBuffer();
