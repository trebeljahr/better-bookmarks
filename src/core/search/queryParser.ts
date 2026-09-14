/**
 * Query parser (AST form).
 *
 * Parses a free-form search string into a structured AST suitable for
 * driving a scoring/filtering pipeline. Deliberately separate from the
 * legacy `query.ts` parser, which returns a flat `Query` shape used by
 * the current overview list. New search consumers (semantic search
 * mixer, omnibox, etc.) should target this AST.
 *
 * Grammar (informal):
 *   query    := term ( WS term )*
 *   term     := filter | phrase | bareWord
 *   filter   :=
 *       tag:VALUE          exact tag match, case-insensitive (D18)
 *       domain:VALUE       exact host match, case-insensitive
 *       is:STATE           STATE ∈ { unread }
 *       rating:OP? NUMBER  OP ∈ { >= | > | <= | < | = }, default =
 *   phrase   := "..."     quoted string of one or more terms
 *   bareWord := unquoted non-empty token without a `<name>:` prefix
 *
 * Semantics:
 *   - Multiple clauses AND implicitly.
 *   - Bare words are OR'd across the fields title/note/tag/url/domain at
 *     match time; a single TermClause represents one such word.
 *   - Quoted phrases are best-effort: v1 requires both terms in the same
 *     field. Recorded as a PhraseClause so the evaluator can decide.
 *   - `should` is reserved for future explicit-OR support; empty in v1.
 *   - Malformed filters (e.g. `tag:` with no value, `rating:abc`) push an
 *     entry into `errors` and fall through as a bare TermClause so the
 *     user still sees results.
 *
 * Never throws — bad input produces an AST with `errors` populated.
 */

export type RatingOp = ">=" | ">" | "<=" | "<" | "=";

export type TermClause = {
  type: "term";
  /** Lowercased single word. */
  value: string;
};

export type PhraseClause = {
  type: "phrase";
  /** Lowercased phrase; contains at least one space in the common case. */
  value: string;
};

export type TagClause = {
  type: "tag";
  /** Lowercased tag name (D18 — display case preserved elsewhere). */
  value: string;
};

export type DomainClause = {
  type: "domain";
  /** Lowercased host (matches Bookmark.domain, itself lowercased). */
  value: string;
};

export type RatingClause = {
  type: "rating";
  op: RatingOp;
  value: number;
};

export type ReadState = "unread";

export type ReadStateClause = {
  type: "readState";
  state: ReadState;
};

/**
 * Union of every clause the parser can emit. `Filter` (below) is a
 * strict subset — the non-scoring predicates that live in
 * `AST.filters`.
 */
export type Clause =
  | TermClause
  | PhraseClause
  | TagClause
  | DomainClause
  | RatingClause
  | ReadStateClause;

/** Non-scoring predicates: everything but text matches. */
export type Filter = TagClause | DomainClause | RatingClause | ReadStateClause;

export type AST = {
  /** All required, scoring text clauses (bare words + phrases). AND'd. */
  must: Clause[];
  /** Reserved for future explicit-OR support. Empty in v1. */
  should: Clause[];
  /** Structured filter predicates. AND'd with `must`. */
  filters: Filter[];
  /** Original input, preserved for debugging / re-render. */
  raw: string;
  /** Diagnostic strings for malformed tokens. Non-fatal. */
  errors: string[];
};

/**
 * Tokenize the input, treating double-quoted substrings as atomic. A
 * quote in the middle of a prefix keeps the prefix attached, so
 * `tag:"my tag"` parses as one token.
 *
 * Unterminated quotes swallow the rest of the input as one token — this
 * matches the user's likely intent while typing.
 */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  const n = input.length;
  let i = 0;
  while (i < n) {
    while (i < n && /\s/.test(input[i])) i++;
    if (i >= n) break;
    let out = "";
    let inQuote = false;
    while (i < n) {
      const c = input[i];
      if (!inQuote && /\s/.test(c)) break;
      if (c === '"') {
        inQuote = !inQuote;
        i++;
        continue;
      }
      out += c;
      i++;
    }
    if (out.length > 0) tokens.push(out);
  }
  return tokens;
}

function parseRatingValue(raw: string): { op: RatingOp; value: number } | null {
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
 * Parse a free-form query string into an AST.
 *
 * Semantics: implicit AND across clauses. Bare words become TermClause,
 * quoted strings become PhraseClause, and the four known prefixes
 * (`tag:`, `domain:`, `is:`, `rating:`) become their typed filter
 * clauses. Anything else falls through as a bare TermClause so the
 * user's typing never produces zero results just because they hit an
 * unknown prefix (`git:foo`, `note:something`, etc.).
 */
export function parseQuery(input: string): AST {
  const ast: AST = {
    must: [],
    should: [],
    filters: [],
    raw: input,
    errors: [],
  };
  if (!input) return ast;

  for (const rawToken of tokenize(input)) {
    // Bare quoted phrase: "foo bar" — the surrounding quotes were
    // stripped by the tokenizer, so a token containing a space (or one
    // originating from a quoted single word) shows up here.
    if (/\s/.test(rawToken)) {
      const value = rawToken.trim().toLowerCase();
      if (value) ast.must.push({ type: "phrase", value });
      continue;
    }

    const colon = rawToken.indexOf(":");

    // No prefix — bare single word.
    if (colon <= 0) {
      ast.must.push({ type: "term", value: rawToken.toLowerCase() });
      continue;
    }

    const key = rawToken.slice(0, colon).toLowerCase();
    const rawValue = rawToken.slice(colon + 1);

    // Missing value after colon — record an error but keep the whole
    // token as a bare word so it can still match.
    if (!rawValue) {
      ast.errors.push(`missing value after ${key}:`);
      ast.must.push({ type: "term", value: rawToken.toLowerCase() });
      continue;
    }

    switch (key) {
      case "tag": {
        ast.filters.push({ type: "tag", value: rawValue.toLowerCase() });
        break;
      }
      case "domain": {
        ast.filters.push({ type: "domain", value: rawValue.toLowerCase() });
        break;
      }
      case "is": {
        const state = rawValue.toLowerCase();
        if (state === "unread") {
          ast.filters.push({ type: "readState", state: "unread" });
        } else {
          ast.errors.push(`unknown is: value: is:${rawValue}`);
          ast.must.push({ type: "term", value: rawToken.toLowerCase() });
        }
        break;
      }
      case "rating": {
        const parsed = parseRatingValue(rawValue);
        if (parsed === null) {
          ast.errors.push(`invalid rating filter: rating:${rawValue}`);
          ast.must.push({ type: "term", value: rawToken.toLowerCase() });
        } else {
          ast.filters.push({ type: "rating", op: parsed.op, value: parsed.value });
        }
        break;
      }
      default: {
        // Unknown prefix — treat the whole thing as a bare term so
        // inputs like "git:foo" still find something.
        ast.must.push({ type: "term", value: rawToken.toLowerCase() });
        break;
      }
    }
  }

  return ast;
}
