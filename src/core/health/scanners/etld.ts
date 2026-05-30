/**
 * Lightweight eTLD+1 extractor.
 *
 * The spec ("Soft-duplicate scanners" section in
 * docs/BOOKMARK_HEALTH.md) calls for `tldts` against a bundled public
 * suffix list. `tldts` is not currently a (transitive) dependency in
 * this worktree, so step 2 ships a small inline replacement that
 * handles the cases this project actually needs:
 *
 *   - Single-level TLDs: `medium.com`, `example.org`, `arxiv.org`.
 *   - The most common compound suffixes (`.co.uk`, `.com.au`, etc.).
 *
 * For everything else we fall back to "last two labels". For a 20k
 * personal bookmark corpus this is overwhelmingly Good Enough. When
 * the proper PSL is added later, replacing this helper is a one-file
 * swap — every soft-dup scanner imports `etldPlusOne` from here.
 */

/**
 * Compound public suffixes that need a third label to form eTLD+1.
 * Kept tight on purpose: every entry here pays for itself in the
 * dedup signal. Add as users surface bugs.
 */
const COMPOUND_SUFFIXES = new Set<string>([
  "co.uk",
  "co.jp",
  "co.kr",
  "co.in",
  "co.nz",
  "co.za",
  "com.au",
  "com.br",
  "com.cn",
  "com.mx",
  "com.sg",
  "com.tw",
  "com.hk",
  "ac.uk",
  "gov.uk",
  "org.uk",
  "ne.jp",
  "or.jp",
  "ac.jp",
]);

/**
 * Return the eTLD+1 for a hostname (lowercase, no leading `www.`).
 * Returns the input unchanged when it has fewer than two labels.
 *
 * Examples:
 *   "www.medium.com" -> "medium.com"
 *   "blog.example.co.uk" -> "example.co.uk"
 *   "arxiv.org" -> "arxiv.org"
 *   "localhost" -> "localhost"
 */
export function etldPlusOne(hostname: string): string {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  const parts = host.split(".");
  if (parts.length < 2) return host;

  // Try the compound-suffix case first: take the last two labels and
  // check if they form a known compound (e.g. "co.uk"). If yes, the
  // eTLD+1 is the last three labels.
  if (parts.length >= 3) {
    const lastTwo = parts.slice(-2).join(".");
    if (COMPOUND_SUFFIXES.has(lastTwo)) {
      return parts.slice(-3).join(".");
    }
  }

  return parts.slice(-2).join(".");
}
