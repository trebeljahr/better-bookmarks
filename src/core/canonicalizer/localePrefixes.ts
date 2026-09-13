/**
 * D10: per-domain locale-prefix stripping.
 *
 * Off by default. The rule set below is intentionally empty — no
 * built-in domain enables locale stripping. Different languages of
 * the same page often have genuinely different content (translations
 * are lossy, community answers differ) so a global default that
 * collapses `/en/` and `/de/` would silently merge unrelated
 * bookmarks. See docs/URL_NORMALIZATION.md → "Locale path prefixes"
 * and docs/DECISIONS.md § D10.
 *
 * To enable stripping for a specific host, add an entry below. The
 * strategy is: leading `/<locale>/…` on the pathname is removed
 * when both the host matches AND `<locale>` is in the rule's
 * `locales` set. Match on the full host (e.g. `docs.nextjs.org`),
 * not on the registrable domain — a site can be multi-tenant.
 *
 * ─────────────────────────────────────────────────────────────
 * Example rule (commented out — reference for future maintainers).
 * Uncomment and add a fixture in canonicalizer/fixtures.ts before
 * shipping any change here.
 *
 *   // nextjs.org mirrors its docs under /<locale>/... where the
 *   // English tree at `/docs` is the source of truth and the other
 *   // locales are auto-translated. Collapsing to the English path
 *   // is safe for identity purposes here.
 *   { host: "nextjs.org", locales: new Set(["en", "es", "fr", "de", "ja", "zh"]) },
 * ─────────────────────────────────────────────────────────────
 */

export type LocalePrefixRule = {
  /** Exact hostname to apply the rule to (no wildcard). */
  host: string;
  /** Locales the leading path segment may take. Lowercase. */
  locales: ReadonlySet<string>;
};

/** Empty by default — see file header. */
export const LOCALE_PREFIX_RULES: readonly LocalePrefixRule[] = [
  // { host: "nextjs.org", locales: new Set(["en", "es", "fr", "de", "ja", "zh"]) },
];

/**
 * If the URL's host has a rule and the pathname starts with
 * `/<locale>/`, remove that segment. Mutates the URL and returns
 * true when a rewrite happened.
 */
export function stripLocalePrefix(url: URL, rules: readonly LocalePrefixRule[]): boolean {
  if (rules.length === 0) return false;
  const rule = rules.find((r) => r.host === url.hostname);
  if (!rule) return false;
  const match = url.pathname.match(/^\/([a-z]{2}(?:-[a-z]{2,4})?)(\/|$)/i);
  if (!match) return false;
  const locale = match[1].toLowerCase();
  if (!rule.locales.has(locale)) return false;
  const remainder = url.pathname.slice(match[0].length - 1);
  url.pathname = remainder === "" ? "/" : remainder;
  return true;
}
