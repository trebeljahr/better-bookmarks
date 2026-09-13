import type { CanonicalizationOverrides, Settings } from "../../shared/types";
import { amazon } from "./amazon";
import { arxiv } from "./arxiv";
import { github } from "./github";
import { google } from "./google";
import { hackernews } from "./hackernews";
import { LOCALE_PREFIX_RULES, stripLocalePrefix } from "./localePrefixes";
import { medium } from "./medium";
import { reddit } from "./reddit";
import { GLOBAL_TRACKING_PARAMS, UNBOOKMARKABLE_SCHEMES } from "./rules";
import { stackoverflow } from "./stackoverflow";
import { twitter } from "./twitter";
import { wikipedia } from "./wikipedia";
import { youtube } from "./youtube";

export type RuleEmit = (ruleId: string) => void;

export type StrategyContext = {
  keepFragments: boolean;
  emit: RuleEmit;
};

export type DomainStrategy = (url: URL, ctx: StrategyContext) => URL | null;

type DomainEntry = { match: (host: string) => boolean; apply: DomainStrategy };

const DOMAIN_STRATEGIES: DomainEntry[] = [
  { match: matchYouTube, apply: youtube },
  { match: matchTwitter, apply: twitter },
  { match: matchReddit, apply: reddit },
  { match: matchGitHub, apply: github },
  { match: matchWikipedia, apply: wikipedia },
  { match: matchAmazon, apply: amazon },
  { match: matchMedium, apply: medium },
  { match: matchStackOverflow, apply: stackoverflow },
  { match: matchGoogle, apply: google },
  { match: matchArxiv, apply: arxiv },
  { match: matchHackerNews, apply: hackernews },
];

export type CanonicalizeResult =
  | {
      ok: true;
      canonical: string;
      domain: string;
      /**
       * Ids of every rule that actually mutated this URL, insertion
       * order. Look up user-facing text with `ruleDescription(id)`
       * from `./rules`. Empty when the URL was already canonical.
       * The `WhyDuplicateTooltip` in the bookmark detail view is the
       * primary consumer — it re-runs canonicalize() on the original
       * URL to explain, per bookmark, why two URLs collapsed to the
       * same identity.
       */
      appliedRules: readonly string[];
    }
  | { ok: false; reason: "unparseable" | "unbookmarkable-scheme"; originalUrl: string };

export function canonicalize(
  rawUrl: string,
  overrides: CanonicalizationOverrides = { extraStrippedParams: [], perDomain: {} },
): CanonicalizeResult {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "unparseable", originalUrl: rawUrl };
  }

  if (UNBOOKMARKABLE_SCHEMES.has(parsed.protocol)) {
    return { ok: false, reason: "unbookmarkable-scheme", originalUrl: rawUrl };
  }

  // Collector for every rule that actually mutates the URL. `emit` is
  // idempotent-per-id (a rule that fires more than once during a single
  // canonicalize() call still surfaces once) so the UI does not have to
  // dedupe.
  const appliedRulesSet = new Set<string>();
  const emit: RuleEmit = (id) => {
    appliedRulesSet.add(id);
  };

  // Host case and default port are normalised by the WHATWG URL
  // parser during `new URL(raw)`; the calls below are defensive but
  // never actually mutate for the schemes we accept, so we do not
  // emit a rule id for them.
  parsed.hostname = parsed.hostname.toLowerCase();
  stripDefaultPort(parsed);
  stripGlobalTrackingParams(parsed, overrides.extraStrippedParams, emit);

  // D10: per-domain locale-prefix stripping. Off by default — the
  // rule set is empty. Runs before per-domain strategies so a
  // strategy sees the localised path already trimmed.
  if (stripLocalePrefix(parsed, LOCALE_PREFIX_RULES)) {
    emit("global:strip-locale-prefix");
  }

  const domainOverride = overrides.perDomain[parsed.hostname] ?? {};
  // D9: a global `keepWikipediaFragments` toggle forces
  // `keepFragments = true` on any wikipedia subdomain, regardless of
  // whether a per-domain override is set for that exact hostname.
  const wikipediaGlobalKeep =
    overrides.keepWikipediaFragments === true && matchWikipedia(parsed.hostname);
  const ctx: StrategyContext = {
    keepFragments: domainOverride.keepFragments === true || wikipediaGlobalKeep,
    emit,
  };

  const strategy = DOMAIN_STRATEGIES.find(({ match }) => match(parsed.hostname));
  let working: URL | null = parsed;
  if (strategy) {
    working = strategy.apply(parsed, ctx);
    if (!working) {
      return { ok: false, reason: "unparseable", originalUrl: rawUrl };
    }
  }

  if (!ctx.keepFragments && working.hash.startsWith("#:~:text=")) {
    working.hash = "";
    emit("global:strip-text-fragment");
  }

  sortQueryParams(working, emit);
  collapseEmptyQuery(working);
  collapseEmptyFragment(working);

  return {
    ok: true,
    canonical: working.toString(),
    domain: working.hostname,
    appliedRules: Array.from(appliedRulesSet),
  };
}

/**
 * Build canonicalization overrides from Settings. The single seam between
 * chrome.storage-shaped settings and the pure canonicalize() function.
 *
 * Callers that create or match Bookmark records against a canonical URL
 * (upsert, sync handlers, initial import, JSON import, legacy migration)
 * fetch settings once and pass the result of this helper as the second
 * argument to canonicalize().
 */
export function overridesFromSettings(settings: Settings): CanonicalizationOverrides {
  return {
    extraStrippedParams: settings.canonicalizationOverrides.extraStrippedParams,
    perDomain: settings.canonicalizationOverrides.perDomain,
    keepWikipediaFragments: settings.keepWikipediaFragments === true,
  };
}

function stripDefaultPort(url: URL): void {
  if (
    (url.protocol === "http:" && url.port === "80") ||
    (url.protocol === "https:" && url.port === "443")
  ) {
    url.port = "";
  }
}

function stripGlobalTrackingParams(url: URL, extra: readonly string[], emit: RuleEmit): void {
  const toDelete: string[] = [];
  for (const key of url.searchParams.keys()) {
    if (GLOBAL_TRACKING_PARAMS.has(key) || extra.includes(key)) {
      toDelete.push(key);
    }
  }
  for (const key of toDelete) {
    url.searchParams.delete(key);
  }
  if (toDelete.length > 0) emit("global:strip-tracking-params");
}

function sortQueryParams(url: URL, emit: RuleEmit): void {
  // Only emit when the sort actually reorders keys. `?a=1&b=2` is
  // already sorted — no point telling the user we did something we
  // did not do.
  const before = url.search;
  url.searchParams.sort();
  if (url.search !== before) emit("global:sort-query-params");
}

function collapseEmptyQuery(url: URL): void {
  if (url.search === "?" || url.searchParams.toString() === "") {
    url.search = "";
  }
}

function collapseEmptyFragment(url: URL): void {
  if (url.hash === "#") {
    url.hash = "";
  }
}

function hostMatches(host: string, suffixes: string[]): boolean {
  return suffixes.some((s) => host === s || host.endsWith(`.${s}`));
}

function matchYouTube(host: string): boolean {
  return hostMatches(host, ["youtube.com", "youtu.be"]);
}
function matchTwitter(host: string): boolean {
  return hostMatches(host, ["twitter.com", "x.com", "mobile.twitter.com"]);
}
function matchReddit(host: string): boolean {
  return hostMatches(host, ["reddit.com"]);
}
function matchGitHub(host: string): boolean {
  return hostMatches(host, ["github.com", "gist.github.com"]);
}
function matchWikipedia(host: string): boolean {
  return host.endsWith("wikipedia.org");
}
function matchAmazon(host: string): boolean {
  return /(^|\.)amazon\./.test(host);
}
function matchMedium(host: string): boolean {
  return host === "medium.com" || host.endsWith(".medium.com");
}
function matchStackOverflow(host: string): boolean {
  return (
    host === "stackoverflow.com" ||
    host === "stackexchange.com" ||
    host.endsWith(".stackexchange.com") ||
    host.endsWith(".stackoverflow.com")
  );
}
function matchGoogle(host: string): boolean {
  return /(^|\.)google\./.test(host) || host === "docs.google.com" || host === "drive.google.com";
}
function matchArxiv(host: string): boolean {
  return host === "arxiv.org" || host.endsWith(".arxiv.org");
}
function matchHackerNews(host: string): boolean {
  return host === "news.ycombinator.com";
}
