/**
 * Deterministic node-color assignment for the graph view.
 *
 * A node's colour is decided by its `primaryTag` — the first tag on
 * the bookmark. If the user has assigned a colour to that tag in the
 * tag manager, we honour it (`Tag.color`); otherwise we pick from a
 * small paletted list using a stable hash of the tag name. Untagged
 * nodes get a neutral grey so they visually recede — colour is a
 * signal, not decoration.
 *
 * Pure module; no DOM, no Dexie. Used by GraphView and covered by
 * subset tests indirectly (via primaryTag).
 */

import type { Tag } from "../../shared/types";

/** Neutral grey for untagged nodes. Matches the muted-foreground token. */
export const UNTAGGED_COLOR = "#94a3b8"; // Tailwind slate-400 — theme-safe

/**
 * Categorical, colour-blind-friendly palette. Order matters — we pick
 * by hash-modulo, so keeping the palette stable keeps colours stable
 * across sessions for the same tag names.
 */
const AUTO_PALETTE: readonly string[] = [
  "#2563eb", // blue-600
  "#16a34a", // green-600
  "#dc2626", // red-600
  "#ca8a04", // yellow-600
  "#9333ea", // purple-600
  "#0891b2", // cyan-600
  "#ea580c", // orange-600
  "#db2777", // pink-600
  "#4d7c0f", // lime-700
  "#0d9488", // teal-600
];

/**
 * Cheap 32-bit FNV-1a hash. Deterministic, non-cryptographic — the
 * only requirement is that "the same tag name always gets the same
 * palette slot". Uses a >>> 0 mask at the end to stay in unsigned
 * 32-bit range under JS integer semantics.
 */
function fnv1a(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * Return a colour for `primaryTag`. If the tag has a user-assigned
 * colour in `tagColors` (`{ tagNameLowercase: color }`), use that;
 * otherwise fall back to the hashed auto-palette. Untagged returns
 * `UNTAGGED_COLOR`.
 */
export function colorForTag(
  primaryTag: string | null,
  tagColors: Readonly<Record<string, string | null>> = {},
): string {
  if (primaryTag === null) return UNTAGGED_COLOR;
  const key = primaryTag.toLowerCase();
  const user = tagColors[key];
  if (typeof user === "string" && user.length > 0) return user;
  return AUTO_PALETTE[fnv1a(key) % AUTO_PALETTE.length];
}

/**
 * Build the `{ lowercaseName: color | null }` lookup from a tag record
 * list. The GraphView passes this once so `colorForTag` stays a pure
 * O(1) call per node during rendering.
 */
export function buildTagColorLookup(tags: readonly Tag[]): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const t of tags) out[t.lowercaseName] = t.color;
  return out;
}
