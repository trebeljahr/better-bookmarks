/**
 * Tag suggestions for a freshly-captured URL.
 *
 * Three sources, ranked together:
 *  1. URL-pattern hints (e.g. github.com -> "Code"). Always strongest signal.
 *  2. Same-domain bookmarks: tags used most often on existing bookmarks
 *     from the same domain.
 *  3. Co-occurrence: tags that frequently co-appear with the URL-pattern
 *     hints in the rest of the corpus.
 *
 * The function is pure: pass in the canonical URL and the full bookmark
 * set, get suggestions back. UI calls it on popup mount with the current
 * tab + already-loaded bookmarks.
 */

import type { Bookmark } from "../../shared/types";

export type TagSuggestion = {
  tag: string;
  score: number;
  reason: "url-pattern" | "same-domain" | "co-occurrence";
};

type PatternRule = { host: RegExp; pathname?: RegExp; tags: string[] };

const PATTERN_RULES: ReadonlyArray<PatternRule> = [
  { host: /^(www\.)?github\.com$/, tags: ["Code"] },
  { host: /^gist\.github\.com$/, tags: ["Code", "Snippet"] },
  { host: /^gitlab\.com$/, tags: ["Code"] },
  { host: /^(www\.)?npmjs\.com$/, tags: ["Code", "JS/TS"] },
  { host: /^pypi\.org$/, tags: ["Code", "Python"] },
  { host: /^crates\.io$/, tags: ["Code", "Rust"] },
  { host: /^rubygems\.org$/, tags: ["Code", "Ruby"] },
  { host: /^pkg\.go\.dev$/, tags: ["Code", "Go"] },
  { host: /^arxiv\.org$/, tags: ["Paper"] },
  { host: /^pubmed\.ncbi\.nlm\.nih\.gov$/, tags: ["Paper"] },
  { host: /^biorxiv\.org$/, tags: ["Paper"] },
  { host: /^openreview\.net$/, tags: ["Paper", "AI"] },
  { host: /^(www\.|m\.)?youtube\.com$/, tags: ["Video"] },
  { host: /^youtu\.be$/, tags: ["Video"] },
  { host: /^(www\.)?vimeo\.com$/, tags: ["Video"] },
  { host: /^(www\.)?reddit\.com$/, tags: ["Discussion"] },
  { host: /^(x|twitter|mobile\.twitter)\.com$/, tags: ["Discussion"] },
  { host: /^news\.ycombinator\.com$/, tags: ["Discussion", "HN"] },
  { host: /^lobste\.rs$/, tags: ["Discussion"] },
  { host: /^(www\.)?goodreads\.com$/, tags: ["Book"] },
  { host: /^openlibrary\.org$/, tags: ["Book"] },
  { host: /^developer\.mozilla\.org$/, tags: ["Docs", "Web Dev"] },
  { host: /^docs\.python\.org$/, tags: ["Docs", "Python"] },
  { host: /^doc\.rust-lang\.org$/, tags: ["Docs", "Rust"] },
  { host: /^(react\.dev|reactjs\.org)$/, tags: ["Docs", "JS/TS"] },
  { host: /wikipedia\.org$/, tags: ["Wiki"] },
  { host: /^(www\.)?medium\.com$/, tags: ["Article"] },
  { host: /\.medium\.com$/, tags: ["Article"] },
  { host: /^(www\.)?substack\.com$/, tags: ["Article"] },
  { host: /\.substack\.com$/, tags: ["Article"] },
];

const URL_PATTERN_WEIGHT = 3;
const SAME_DOMAIN_WEIGHT = 2;
const CO_OCCURRENCE_WEIGHT = 1;

const MIN_SAME_DOMAIN_FRACTION = 0.4; // tag must appear on >= 40% of same-domain bookmarks
const MIN_CO_OCCURRENCE = 3; // need at least 3 co-appearances to surface

export function suggestTags(
  canonicalUrl: string,
  bookmarks: ReadonlyArray<Bookmark>,
  opts: { limit?: number; excludeAlreadySelected?: ReadonlyArray<string> } = {},
): TagSuggestion[] {
  const excludeLower = new Set((opts.excludeAlreadySelected ?? []).map((t) => t.toLowerCase()));
  const limit = opts.limit ?? 8;

  let parsed: URL;
  try {
    parsed = new URL(canonicalUrl);
  } catch {
    return [];
  }
  const host = parsed.hostname;
  const path = parsed.pathname;

  // 1. URL-pattern hints.
  const patternTags: string[] = [];
  for (const rule of PATTERN_RULES) {
    if (!rule.host.test(host)) continue;
    if (rule.pathname && !rule.pathname.test(path)) continue;
    for (const t of rule.tags) patternTags.push(t);
  }

  // 2. Same-domain tag frequency.
  const sameDomain = bookmarks.filter((b) => b.domain === host);
  const sameDomainCounts: Record<string, number> = {};
  for (const b of sameDomain) {
    for (const t of b.tags) sameDomainCounts[t] = (sameDomainCounts[t] ?? 0) + 1;
  }

  // 3. Co-occurrence with the URL-pattern tags.
  const patternLower = new Set(patternTags.map((t) => t.toLowerCase()));
  const coOccurCounts: Record<string, number> = {};
  if (patternLower.size > 0) {
    for (const b of bookmarks) {
      const lowered = b.tags.map((t) => t.toLowerCase());
      const matchesPattern = lowered.some((t) => patternLower.has(t));
      if (!matchesPattern) continue;
      for (const t of b.tags) {
        if (patternLower.has(t.toLowerCase())) continue;
        coOccurCounts[t] = (coOccurCounts[t] ?? 0) + 1;
      }
    }
  }

  const accum = new Map<string, TagSuggestion>();
  function add(tag: string, weight: number, reason: TagSuggestion["reason"]) {
    const key = tag.toLowerCase();
    if (excludeLower.has(key)) return;
    const existing = accum.get(key);
    if (!existing || weight > existing.score) {
      accum.set(key, { tag, score: weight, reason });
    } else if (existing.score === weight && reason !== existing.reason) {
      // Same score, different source — leave existing but boost slightly so
      // multi-source agreement floats up.
      existing.score += 0.25;
    }
  }

  for (const tag of patternTags) add(tag, URL_PATTERN_WEIGHT, "url-pattern");

  for (const [tag, count] of Object.entries(sameDomainCounts)) {
    if (sameDomain.length === 0) continue;
    const frac = count / sameDomain.length;
    if (frac < MIN_SAME_DOMAIN_FRACTION) continue;
    add(tag, SAME_DOMAIN_WEIGHT + frac, "same-domain");
  }

  for (const [tag, count] of Object.entries(coOccurCounts)) {
    if (count < MIN_CO_OCCURRENCE) continue;
    add(tag, CO_OCCURRENCE_WEIGHT + Math.log10(count), "co-occurrence");
  }

  return Array.from(accum.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
