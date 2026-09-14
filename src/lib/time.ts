/**
 * Compact relative-time formatter used in list rows.
 *
 * Returns strings like "just now", "5m ago", "3h ago", "2d ago", "4w ago",
 * "6mo ago", "1y ago". Future timestamps (clock skew, stray records) fall
 * back to "just now" rather than "in 3s" — the affordance is scan-speed
 * for a scrolling list, not precision.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

export function formatRelativeTime(timestampMs: number, nowMs: number = Date.now()): string {
  const delta = nowMs - timestampMs;
  if (!Number.isFinite(delta) || delta < MINUTE) return "just now";
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)}m ago`;
  if (delta < DAY) return `${Math.floor(delta / HOUR)}h ago`;
  if (delta < WEEK) return `${Math.floor(delta / DAY)}d ago`;
  if (delta < MONTH) return `${Math.floor(delta / WEEK)}w ago`;
  if (delta < YEAR) return `${Math.floor(delta / MONTH)}mo ago`;
  return `${Math.floor(delta / YEAR)}y ago`;
}
