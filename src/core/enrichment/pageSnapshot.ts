/**
 * Per-bookmark page snapshot (DECISIONS D15).
 *
 * Two responsibilities, kept in one file:
 *   - `extractArticleText` — a small hand-rolled article extractor that
 *     walks `<main>` → `<article>` → `<body>` and strips scripts, styles,
 *     nav/header/footer/aside and other chrome. `@mozilla/readability`
 *     would give slightly better prose ranking but its bundle sits above
 *     the 40 KB gz budget the D15 chip set for this feature; keeping the
 *     extractor in-tree also means one less dep to vet for CWS review.
 *   - `capturePageSnapshot` — bytes-in-bytes-out helper that extracts,
 *     truncates on the UTF-8 byte cap, and writes to the `pageSnapshots`
 *     table (or hands the write to an injected sink for tests). Callers
 *     that want the settings gate use `maybeCaptureSnapshotFromSettings`.
 *
 * Truncation is on the codepoint boundary via `TextEncoder` + walkback,
 * so we never leave a half-encoded surrogate pair in the stored text.
 * The pre-truncation UTF-8 byte length lands in `byteLength` so downstream
 * search can tell "this page was 3 MB, we kept 500 KB".
 */

import type { PageSnapshot, Settings } from "../../shared/types";
import { putPageSnapshot } from "../storage/pageSnapshots";
import { getSettings } from "../storage/settings";

// Hard cap per snapshot. Big enough for any long-form article, small
// enough that a 20k-bookmark corpus at the cap tops out around 10 GB
// worst-case — and the average case is a fraction of that. Snapshots
// that would exceed the cap are truncated (and logged), never rejected.
export const PAGE_SNAPSHOT_MAX_BYTES = 500 * 1024;

const STRIP_SELECTOR =
  "script, style, nav, header, footer, aside, noscript, template, iframe, form, svg, canvas, picture";

/**
 * Extract readable text from an HTML string. Prefers `<main>`, falls
 * back to the first `<article>`, then `<body>`. Strips scripts/styles
 * and page chrome, then collapses whitespace.
 */
export function extractArticleText(html: string): string {
  if (typeof DOMParser === "undefined") return "";
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(html, "text/html");
  } catch {
    return "";
  }
  if (!doc?.documentElement) return "";

  const root =
    doc.querySelector("main") ?? doc.querySelector("article") ?? doc.body ?? doc.documentElement;
  if (!root) return "";

  const clone = root.cloneNode(true) as HTMLElement;
  for (const node of Array.from(clone.querySelectorAll(STRIP_SELECTOR))) {
    node.remove();
  }
  const raw = clone.textContent ?? "";
  return raw.replace(/\s+/g, " ").trim();
}

export type PageSnapshotSink = (snapshot: PageSnapshot) => Promise<void>;

export type CapturePageSnapshotOpts = {
  bookmarkId: string;
  html: string;
  now?: number;
  maxBytes?: number;
  sink?: PageSnapshotSink;
};

export type CapturePageSnapshotResult = {
  captured: boolean;
  reason?: "empty";
  bookmarkId: string;
  byteLength: number;
  storedByteLength: number;
  truncated: boolean;
};

/**
 * Extract, cap, and write one snapshot. Returns metadata about the
 * write. Non-empty caps are truncated at the byte boundary; empty
 * extracts skip the write entirely so callers can distinguish "nothing
 * to save" from "saved zero bytes".
 */
export async function capturePageSnapshot(
  opts: CapturePageSnapshotOpts,
): Promise<CapturePageSnapshotResult> {
  const now = opts.now ?? Date.now();
  const cap = opts.maxBytes ?? PAGE_SNAPSHOT_MAX_BYTES;
  const sink = opts.sink ?? putPageSnapshot;

  const text = extractArticleText(opts.html);
  if (text.length === 0) {
    return {
      captured: false,
      reason: "empty",
      bookmarkId: opts.bookmarkId,
      byteLength: 0,
      storedByteLength: 0,
      truncated: false,
    };
  }

  const encoder = new TextEncoder();
  const fullBytes = encoder.encode(text);
  const fullByteLength = fullBytes.byteLength;

  let stored = text;
  let truncated = false;
  if (fullByteLength > cap) {
    stored = truncateOnCodepointBoundary(text, cap);
    truncated = true;
    console.log(`pageSnapshot: truncated ${opts.bookmarkId} ${fullByteLength}B -> ${cap}B`);
  }

  const snapshot: PageSnapshot = {
    bookmarkId: opts.bookmarkId,
    capturedAt: now,
    text: stored,
    byteLength: fullByteLength,
  };
  await sink(snapshot);

  return {
    captured: true,
    bookmarkId: opts.bookmarkId,
    byteLength: fullByteLength,
    storedByteLength: encoder.encode(stored).byteLength,
    truncated,
  };
}

/**
 * Cut `text` at the largest prefix whose UTF-8 encoding fits in `cap`
 * bytes. Walks back from the byte-index candidate to the previous
 * codepoint boundary so we never split a surrogate pair.
 */
export function truncateOnCodepointBoundary(text: string, cap: number): string {
  if (cap <= 0) return "";
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  if (bytes.byteLength <= cap) return text;
  // Walk back to the start of a UTF-8 sequence (bytes where the two
  // high bits are not `10`, i.e. continuation bytes have (b & 0xc0) ==
  // 0x80). Include the candidate index itself as a stopping point.
  let end = cap;
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) {
    end--;
  }
  const decoder = new TextDecoder("utf-8", { fatal: false });
  return decoder.decode(bytes.subarray(0, end));
}

export type SettingsReader = () => Promise<Settings>;

/**
 * Settings-gated capture. Callers wire this into `enrichBookmark` so
 * the snapshot only lands when both `networkEnrichmentEnabled` and
 * `pageSnapshotEnabled` are on. Tests can inject `settingsReader` /
 * `sink` overrides; production callers pass just `bookmarkId` + `html`.
 */
export async function maybeCaptureSnapshotFromSettings(opts: {
  bookmarkId: string;
  html: string;
  now?: number;
  settingsReader?: SettingsReader;
  sink?: PageSnapshotSink;
}): Promise<CapturePageSnapshotResult | null> {
  const reader = opts.settingsReader ?? getSettings;
  const settings = await reader();
  if (!settings.networkEnrichmentEnabled || !settings.pageSnapshotEnabled) {
    return null;
  }
  return capturePageSnapshot({
    bookmarkId: opts.bookmarkId,
    html: opts.html,
    now: opts.now,
    sink: opts.sink,
  });
}
