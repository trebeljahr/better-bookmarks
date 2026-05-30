/**
 * Title-similarity helpers for `soft-dup.title-similarity`.
 *
 * The spec says:
 *   - normalised Damerau-Levenshtein similarity (1 - distance / max-len)
 *   - title lowercased, trimmed, punctuation collapsed before compare
 *   - pairwise within an eTLD+1 bucket
 *   - threshold >= 0.9
 *
 * Damerau-Levenshtein is regular Levenshtein plus a transposition
 * operation (e.g. "form" vs "from" has distance 1 instead of 2).
 * Implementation is the standard DP table walk; for the bucket sizes
 * we hit (capped at 200 per the spec) this is fine without further
 * optimisation.
 */

/**
 * Lowercase, trim, collapse whitespace, and strip punctuation. We
 * keep alphanumerics and ASCII spaces; everything else folds into a
 * single space.
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Damerau-Levenshtein distance between two strings. O(n*m) time and
 * O(n*m) space — fine for bucketed-pairwise comparison within a
 * 200-entry cap.
 */
export function damerauLevenshtein(a: string, b: string): number {
  const n = a.length;
  const m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;

  // dp[i][j] = edit distance between a[0..i) and b[0..j).
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // deletion
        dp[i][j - 1] + 1, // insertion
        dp[i - 1][j - 1] + cost, // substitution
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1); // transposition
      }
    }
  }

  return dp[n][m];
}

/**
 * Normalised similarity in [0, 1]. 1 = identical, 0 = completely
 * different. Empty-vs-empty is 1 (defensive — caller shouldn't pass
 * empties but we don't want NaN).
 */
export function titleSimilarity(a: string, b: string): number {
  const aN = normalizeTitle(a);
  const bN = normalizeTitle(b);
  if (aN.length === 0 && bN.length === 0) return 1;
  const distance = damerauLevenshtein(aN, bN);
  const maxLen = Math.max(aN.length, bN.length);
  if (maxLen === 0) return 1;
  return 1 - distance / maxLen;
}
