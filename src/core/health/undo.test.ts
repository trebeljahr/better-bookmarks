/**
 * UndoBuffer mechanics (no DB).
 */
import { describe, expect, it, vi } from "vitest";
import { UndoBuffer } from "./undo";

function emptyInputs() {
  return { bookmarks: [], chromeMappings: [], tagDeltas: [] };
}

describe("UndoBuffer", () => {
  it("push assigns expiresAt = createdAt + ttl", () => {
    const now = 1000;
    const buf = new UndoBuffer({ ttlMs: 30_000, now: () => now });
    const snap = buf.push({ label: "x", ...emptyInputs() });
    expect(snap.createdAt).toBe(1000);
    expect(snap.expiresAt).toBe(31_000);
  });

  it("pop removes the snapshot", () => {
    const buf = new UndoBuffer();
    const snap = buf.push({ label: "x", ...emptyInputs() });
    expect(buf.pop(snap.id)).toEqual(snap);
    expect(buf.peek(snap.id)).toBeUndefined();
  });

  it("pruneExpired drops snapshots past expiresAt", () => {
    let now = 1000;
    const buf = new UndoBuffer({ ttlMs: 100, now: () => now });
    const snap = buf.push({ label: "x", ...emptyInputs() });
    expect(buf.peek(snap.id)).toBeTruthy();
    now = 1200;
    const dropped = buf.pruneExpired();
    expect(dropped).toHaveLength(1);
    expect(buf.peek(snap.id)).toBeUndefined();
  });

  it("list returns newest-first", () => {
    let now = 1000;
    const buf = new UndoBuffer({ now: () => now });
    const a = buf.push({ label: "a", ...emptyInputs() });
    now = 2000;
    const b = buf.push({ label: "b", ...emptyInputs() });
    const list = buf.list();
    expect(list.map((s) => s.id)).toEqual([b.id, a.id]);
  });

  it("notifies subscribers on push and pop", () => {
    const buf = new UndoBuffer();
    const listener = vi.fn();
    buf.subscribe(listener);
    const snap = buf.push({ label: "x", ...emptyInputs() });
    expect(listener).toHaveBeenCalledTimes(1);
    buf.pop(snap.id);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
