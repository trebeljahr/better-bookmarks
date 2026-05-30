/**
 * Query parser.
 *
 * Grammar (informal):
 *   query := term ( WS term )*
 *   term  := filter | bareWord
 *   filter:
 *     tag:NAME            (exact tag match, case-insensitive)
 *     -tag:NAME           (exclude bookmarks carrying NAME)
 *     domain:HOST         (exact domain match, case-insensitive)
 *     is:STATUS           (one of unread|reading|read|archived)
 *     is:untagged         (bookmarks with no tags — sidebar virtual folder)
 *     rating:OP? NUMBER   (OP one of >= > <= < =, default =)
 *   bareWord: a non-empty token without a leading "name:" prefix.
 *
 * The parser is lenient: malformed filters fall through as bare words so
 * that the user's typing never produces zero results just because they
 * mis-typed the syntax.
 *
 * Note: `is:untagged` is parsed into Query.untagged (boolean) rather than
 * the ReadStatus union — it's a tag-presence predicate, not a read state.
 */

import type { ReadStatus } from "../../shared/types";

export type RatingOp = ">=" | ">" | "<=" | "<" | "=";

export type RatingFilter = {
  op: RatingOp;
  value: number;
};

export type Query = {
  bare: string[]; // lowercased bare-word tokens
  tags: string[]; // lowercased exact tag names
  excludeTags: string[]; // lowercased tag names to exclude (-tag:NAME)
  domains: string[]; // lowercased exact domain names
  statuses: ReadStatus[]; // status filters
  untagged: boolean; // is:untagged — keep only bookmarks with empty tags
  rating: RatingFilter | null; // null means no rating filter
  raw: string;
  errors: string[];
};

const STATUS_VALUES: readonly ReadStatus[] = ["unread", "reading", "read", "archived"];

function isStatus(s: string): s is ReadStatus {
  return (STATUS_VALUES as readonly string[]).includes(s);
}

function parseRatingValue(raw: string): RatingFilter | null {
  // Accepts "5", ">=7", ">3", "<=4", "<2", "=8".
  let op: RatingOp = "=";
  let rest = raw;
  if (rest.startsWith(">=")) {
    op = ">=";
    rest = rest.slice(2);
  } else if (rest.startsWith("<=")) {
    op = "<=";
    rest = rest.slice(2);
  } else if (rest.startsWith(">")) {
    op = ">";
    rest = rest.slice(1);
  } else if (rest.startsWith("<")) {
    op = "<";
    rest = rest.slice(1);
  } else if (rest.startsWith("=")) {
    op = "=";
    rest = rest.slice(1);
  }
  if (!rest) return null;
  const n = Number(rest);
  if (!Number.isFinite(n)) return null;
  return { op, value: n };
}

/**
 * Parse a free-form query string into a structured Query AST.
 *
 * Never throws — malformed filters surface in `errors` and also fall
 * through as bare words so the user still gets some results.
 */
export function parseQuery(input: string): Query {
  const query: Query = {
    bare: [],
    tags: [],
    excludeTags: [],
    domains: [],
    statuses: [],
    untagged: false,
    rating: null,
    raw: input,
    errors: [],
  };
  if (!input) return query;

  // Split on whitespace only — filters use ":" internally so we must NOT
  // split on punctuation here.
  const tokens = input.split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    // Leading "-" turns a filter into an exclusion. Only `-tag:` is
    // supported; anything else falls through to bare.
    if (token.startsWith("-")) {
      const rest = token.slice(1);
      const colon = rest.indexOf(":");
      if (colon > 0 && rest.slice(0, colon).toLowerCase() === "tag") {
        const value = rest.slice(colon + 1);
        if (value) {
          query.excludeTags.push(value.toLowerCase());
          continue;
        }
      }
      query.bare.push(token.toLowerCase());
      continue;
    }
    const colon = token.indexOf(":");
    if (colon <= 0) {
      query.bare.push(token.toLowerCase());
      continue;
    }
    const key = token.slice(0, colon).toLowerCase();
    const value = token.slice(colon + 1);
    if (!value) {
      // "tag:" with no value -> treat as bare so user still gets feedback.
      query.bare.push(token.toLowerCase());
      continue;
    }
    switch (key) {
      case "tag": {
        query.tags.push(value.toLowerCase());
        break;
      }
      case "domain": {
        query.domains.push(value.toLowerCase());
        break;
      }
      case "is": {
        const lower = value.toLowerCase();
        if (lower === "untagged") {
          query.untagged = true;
        } else if (isStatus(lower)) {
          query.statuses.push(lower);
        } else {
          query.errors.push(`unknown status: is:${value}`);
          query.bare.push(token.toLowerCase());
        }
        break;
      }
      case "rating": {
        const parsed = parseRatingValue(value);
        if (parsed === null) {
          query.errors.push(`invalid rating filter: rating:${value}`);
          query.bare.push(token.toLowerCase());
        } else {
          // Last rating filter wins. We could OR them, but a single
          // comparator is the common case and the UX simpler.
          query.rating = parsed;
        }
        break;
      }
      default: {
        // Unknown filter prefix — treat the whole token as a bare word so
        // searches like "node:foo" or addresses like "git:bar" still
        // produce results.
        query.bare.push(token.toLowerCase());
        break;
      }
    }
  }
  return query;
}

export function ratingMatches(value: number | null, filter: RatingFilter | null): boolean {
  if (filter === null) return true;
  if (value === null) return false;
  switch (filter.op) {
    case ">=":
      return value >= filter.value;
    case ">":
      return value > filter.value;
    case "<=":
      return value <= filter.value;
    case "<":
      return value < filter.value;
    case "=":
      return value === filter.value;
  }
}
