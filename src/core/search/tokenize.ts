/**
 * Tokenizer for the search subsystem.
 *
 * Lowercases input, strips punctuation (except a small inline set), and
 * splits on whitespace + most punctuation. URLs are recognized and broken
 * into their constituent domain labels and path segments so that searches
 * for "github" find "github.com/foo/bar".
 */

// Inline punctuation that should NOT split a token. Useful for things like
// "node.js", "ai-tools", "snake_case", "vue.js", "api/v1".
const INLINE_PUNCT = new Set(["-", "_", ".", "/", ":"]);

// Split anywhere that is not a letter, digit, or inline punctuation.
// We use a manual scanner instead of a regex split so that we can also
// recognise URLs mid-string and tokenize them specially.
function isWordChar(ch: string): boolean {
  if (!ch) return false;
  if (ch >= "a" && ch <= "z") return true;
  if (ch >= "A" && ch <= "Z") return true;
  if (ch >= "0" && ch <= "9") return true;
  if (INLINE_PUNCT.has(ch)) return true;
  return false;
}

function stripWrappingPunct(token: string): string {
  let start = 0;
  let end = token.length;
  while (start < end && INLINE_PUNCT.has(token[start])) start++;
  while (end > start && INLINE_PUNCT.has(token[end - 1])) end--;
  return token.slice(start, end);
}

function isUrlLike(token: string): boolean {
  return token.startsWith("http://") || token.startsWith("https://");
}

function tokenizeUrl(url: string): string[] {
  const out: string[] = [];
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return out;
  }
  // Domain labels: "en.wikipedia.org" -> ["en", "wikipedia", "org"], plus the full host.
  const host = parsed.hostname.toLowerCase();
  if (host) {
    out.push(host);
    for (const label of host.split(".")) {
      if (label) out.push(label);
    }
  }
  // Path segments: "/wiki/Foo_Bar" -> ["wiki", "foo_bar", "foo", "bar"].
  const pathParts = parsed.pathname.split("/").filter(Boolean);
  for (const segment of pathParts) {
    const lower = segment.toLowerCase();
    out.push(lower);
    // also split on inline punctuation so that "foo-bar-baz" -> tokens.
    for (const sub of lower.split(/[-_.]+/).filter(Boolean)) {
      if (sub !== lower) out.push(sub);
    }
  }
  return out;
}

/**
 * Tokenize a string of free-form text into normalized tokens.
 *
 * - Lowercases everything.
 * - Splits on whitespace and most punctuation.
 * - Keeps `-`, `_`, `.`, `/`, `:` inside tokens.
 * - URLs (http/https) are broken into domain labels and path segments.
 * - Empty input returns an empty array.
 */
export function tokenize(input: string | null | undefined): string[] {
  if (!input) return [];
  const out: string[] = [];
  let i = 0;
  const n = input.length;
  while (i < n) {
    const ch = input[i];
    if (!isWordChar(ch)) {
      i++;
      continue;
    }
    let j = i;
    while (j < n && isWordChar(input[j])) j++;
    const raw = input.slice(i, j);
    i = j;
    if (isUrlLike(raw)) {
      for (const t of tokenizeUrl(raw)) {
        if (t) out.push(t);
      }
      continue;
    }
    const trimmed = stripWrappingPunct(raw).toLowerCase();
    if (!trimmed) continue;
    out.push(trimmed);
  }
  return out;
}

/**
 * Tokenize a domain string. Always returns the full host plus each label.
 * "en.wikipedia.org" -> ["en.wikipedia.org", "en", "wikipedia", "org"].
 */
export function tokenizeDomain(domain: string | null | undefined): string[] {
  if (!domain) return [];
  const host = domain.toLowerCase().trim();
  if (!host) return [];
  const out: string[] = [host];
  for (const label of host.split(".")) {
    if (label) out.push(label);
  }
  return out;
}

// Unicode-aware word matcher used by the inverted-index tokenizer.
// Matches runs of one or more letters optionally followed by digits
// (\p{L}+\p{N}*), so `word`, `word17`, `模型`, `Café` all pass; pure digits
// and standalone punctuation/emoji do not. `u` flag opts into Unicode
// property escapes.
const INVERTED_WORD_RE = /\p{L}+\p{N}*/gu;

/**
 * Tokenize free-form text for the inverted-index (`searchIndex`) store.
 *
 * - Lowercases input (locale-independent).
 * - Splits on any character that is not part of `\p{L}+\p{N}*`.
 * - Enforces a minimum token length of 2 (so single-letter noise doesn't
 *   inflate the postings list).
 * - No stopword list for v1 — cheaper false positives than a bad list.
 *
 * Handles Unicode scripts (Latin, Cyrillic, CJK) natively via the `u`
 * flag; emoji and pure-digit sequences produce no tokens.
 */
export function tokenizeInverted(input: string | null | undefined): string[] {
  if (!input) return [];
  const out: string[] = [];
  for (const match of input.toLowerCase().matchAll(INVERTED_WORD_RE)) {
    const t = match[0];
    if (t.length >= 2) out.push(t);
  }
  return out;
}
