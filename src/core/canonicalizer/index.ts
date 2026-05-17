import type { CanonicalizationOverrides } from "../../shared/types";
import { amazon } from "./amazon";
import { arxiv } from "./arxiv";
import { github } from "./github";
import { google } from "./google";
import { hackernews } from "./hackernews";
import { medium } from "./medium";
import { reddit } from "./reddit";
import { GLOBAL_TRACKING_PARAMS, UNBOOKMARKABLE_SCHEMES } from "./rules";
import { stackoverflow } from "./stackoverflow";
import { twitter } from "./twitter";
import { wikipedia } from "./wikipedia";
import { youtube } from "./youtube";

export type StrategyContext = {
  keepFragments: boolean;
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
  | { ok: true; canonical: string; domain: string }
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

  parsed.hostname = parsed.hostname.toLowerCase();
  stripDefaultPort(parsed);
  stripGlobalTrackingParams(parsed, overrides.extraStrippedParams);

  const domainOverride = overrides.perDomain[parsed.hostname] ?? {};
  const ctx: StrategyContext = { keepFragments: domainOverride.keepFragments === true };

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
  }

  sortQueryParams(working);
  collapseEmptyQuery(working);
  collapseEmptyFragment(working);

  return {
    ok: true,
    canonical: working.toString(),
    domain: working.hostname,
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

function stripGlobalTrackingParams(url: URL, extra: readonly string[]): void {
  const toDelete: string[] = [];
  for (const key of url.searchParams.keys()) {
    if (GLOBAL_TRACKING_PARAMS.has(key) || extra.includes(key)) {
      toDelete.push(key);
    }
  }
  for (const key of toDelete) {
    url.searchParams.delete(key);
  }
}

function sortQueryParams(url: URL): void {
  url.searchParams.sort();
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
