import { describe, expect, it } from "vitest";
import {
  type AST,
  type DomainClause,
  type PhraseClause,
  type RatingClause,
  type ReadStateClause,
  type TagClause,
  type TermClause,
  parseQuery,
} from "./queryParser";

function termValues(ast: AST): string[] {
  return ast.must
    .filter((c): c is TermClause => c.type === "term")
    .map((c) => c.value);
}

function phraseValues(ast: AST): string[] {
  return ast.must
    .filter((c): c is PhraseClause => c.type === "phrase")
    .map((c) => c.value);
}

function tagValues(ast: AST): string[] {
  return ast.filters
    .filter((c): c is TagClause => c.type === "tag")
    .map((c) => c.value);
}

function domainValues(ast: AST): string[] {
  return ast.filters
    .filter((c): c is DomainClause => c.type === "domain")
    .map((c) => c.value);
}

function ratingFilters(ast: AST): RatingClause[] {
  return ast.filters.filter((c): c is RatingClause => c.type === "rating");
}

function readStates(ast: AST): ReadStateClause["state"][] {
  return ast.filters
    .filter((c): c is ReadStateClause => c.type === "readState")
    .map((c) => c.state);
}

describe("parseQuery — empty & bare words", () => {
  it("returns an empty AST for empty input", () => {
    const ast = parseQuery("");
    expect(ast.must).toEqual([]);
    expect(ast.should).toEqual([]);
    expect(ast.filters).toEqual([]);
    expect(ast.errors).toEqual([]);
    expect(ast.raw).toBe("");
  });

  it("returns an empty AST for whitespace-only input", () => {
    const ast = parseQuery("   \t\n  ");
    expect(ast.must).toEqual([]);
    expect(ast.filters).toEqual([]);
    expect(ast.errors).toEqual([]);
  });

  it("emits one TermClause per bare word, lowercased", () => {
    const ast = parseQuery("Diffusion Models");
    expect(termValues(ast)).toEqual(["diffusion", "models"]);
    // Bare words are AND'd in `must`, not `should`.
    expect(ast.should).toEqual([]);
  });

  it("preserves original input in raw", () => {
    const ast = parseQuery("HeLLo WoRLD");
    expect(ast.raw).toBe("HeLLo WoRLD");
  });
});

describe("parseQuery — tag: filter", () => {
  it("parses tag:foo as a TagClause in filters", () => {
    const ast = parseQuery("tag:AI");
    expect(tagValues(ast)).toEqual(["ai"]);
    expect(ast.must).toEqual([]);
  });

  it("ANDs multiple tag: clauses (both survive in filters)", () => {
    const ast = parseQuery("tag:ai tag:Paper");
    expect(tagValues(ast)).toEqual(["ai", "paper"]);
  });

  it("lowercases the tag value per D18", () => {
    const ast = parseQuery("tag:MachineLearning");
    expect(tagValues(ast)).toEqual(["machinelearning"]);
  });

  it("errors and falls back to a bare term when the value is missing", () => {
    const ast = parseQuery("tag:");
    expect(tagValues(ast)).toEqual([]);
    expect(termValues(ast)).toEqual(["tag:"]);
    expect(ast.errors.some((e) => /missing value after tag/.test(e))).toBe(true);
  });
});

describe("parseQuery — domain: filter", () => {
  it("parses domain:example.com as a DomainClause, lowercased", () => {
    const ast = parseQuery("domain:Example.COM");
    expect(domainValues(ast)).toEqual(["example.com"]);
    expect(ast.must).toEqual([]);
  });

  it("ANDs multiple domain: clauses", () => {
    const ast = parseQuery("domain:one.com domain:Two.NET");
    expect(domainValues(ast)).toEqual(["one.com", "two.net"]);
  });

  it("errors and falls back to a bare term when the value is missing", () => {
    const ast = parseQuery("domain:");
    expect(domainValues(ast)).toEqual([]);
    expect(termValues(ast)).toEqual(["domain:"]);
    expect(ast.errors.some((e) => /missing value after domain/.test(e))).toBe(true);
  });
});

describe("parseQuery — is: filter", () => {
  it("parses is:unread as a ReadStateClause", () => {
    const ast = parseQuery("is:unread");
    expect(readStates(ast)).toEqual(["unread"]);
    expect(ast.must).toEqual([]);
    expect(ast.errors).toEqual([]);
  });

  it("normalizes case (is:UNREAD)", () => {
    const ast = parseQuery("is:UNREAD");
    expect(readStates(ast)).toEqual(["unread"]);
  });

  it("errors and falls back to a bare term for unknown is: values", () => {
    const ast = parseQuery("is:nope");
    expect(readStates(ast)).toEqual([]);
    expect(termValues(ast)).toEqual(["is:nope"]);
    expect(ast.errors.some((e) => /unknown is:/.test(e))).toBe(true);
  });

  it("errors and falls back when is: has no value", () => {
    const ast = parseQuery("is:");
    expect(readStates(ast)).toEqual([]);
    expect(termValues(ast)).toEqual(["is:"]);
    expect(ast.errors.some((e) => /missing value after is/.test(e))).toBe(true);
  });
});

describe("parseQuery — rating: filter", () => {
  it("parses rating:N as an equality filter", () => {
    const ast = parseQuery("rating:5");
    expect(ratingFilters(ast)).toEqual([{ type: "rating", op: "=", value: 5 }]);
  });

  it("parses each comparator", () => {
    expect(ratingFilters(parseQuery("rating:>=7"))).toEqual([
      { type: "rating", op: ">=", value: 7 },
    ]);
    expect(ratingFilters(parseQuery("rating:>3"))).toEqual([
      { type: "rating", op: ">", value: 3 },
    ]);
    expect(ratingFilters(parseQuery("rating:<=4"))).toEqual([
      { type: "rating", op: "<=", value: 4 },
    ]);
    expect(ratingFilters(parseQuery("rating:<2"))).toEqual([
      { type: "rating", op: "<", value: 2 },
    ]);
    expect(ratingFilters(parseQuery("rating:=8"))).toEqual([
      { type: "rating", op: "=", value: 8 },
    ]);
  });

  it("errors and falls back when the value is not numeric", () => {
    const ast = parseQuery("rating:abc");
    expect(ratingFilters(ast)).toEqual([]);
    expect(termValues(ast)).toEqual(["rating:abc"]);
    expect(ast.errors.some((e) => /invalid rating/.test(e))).toBe(true);
  });

  it("errors and falls back when a comparator has no number", () => {
    const ast = parseQuery("rating:>=");
    expect(ratingFilters(ast)).toEqual([]);
    expect(termValues(ast)).toEqual(["rating:>="]);
    expect(ast.errors.length).toBeGreaterThan(0);
  });

  it("errors and falls back when rating: has no value", () => {
    const ast = parseQuery("rating:");
    expect(ratingFilters(ast)).toEqual([]);
    expect(termValues(ast)).toEqual(["rating:"]);
    expect(ast.errors.some((e) => /missing value after rating/.test(e))).toBe(true);
  });
});

describe("parseQuery — phrase (quoted) matching", () => {
  it("parses a quoted multi-word phrase as a PhraseClause", () => {
    const ast = parseQuery('"foo bar"');
    expect(phraseValues(ast)).toEqual(["foo bar"]);
    expect(termValues(ast)).toEqual([]);
  });

  it("lowercases phrase contents", () => {
    const ast = parseQuery('"Foo Bar Baz"');
    expect(phraseValues(ast)).toEqual(["foo bar baz"]);
  });

  it("treats a quoted single word as a plain term (no space)", () => {
    // Without a space the token round-trips as a bare word after quote
    // stripping — same effect as typing it unquoted.
    const ast = parseQuery('"single"');
    expect(termValues(ast)).toEqual(["single"]);
    expect(phraseValues(ast)).toEqual([]);
  });

  it("preserves internal whitespace between quoted words", () => {
    const ast = parseQuery('"multi   spaced   phrase"');
    expect(phraseValues(ast)).toEqual(["multi   spaced   phrase"]);
  });

  it("survives an unterminated quote by absorbing the tail", () => {
    const ast = parseQuery('foo "bar baz');
    expect(termValues(ast)).toEqual(["foo"]);
    expect(phraseValues(ast)).toEqual(["bar baz"]);
    // Non-fatal: no crash, no error recorded — best-effort.
  });
});

describe("parseQuery — combinations & AND semantics", () => {
  it("splits bare words, filters, and phrases into the right buckets", () => {
    const ast = parseQuery(
      'react hooks tag:frontend domain:react.dev is:unread rating:>=8 "server components"',
    );
    expect(termValues(ast)).toEqual(["react", "hooks"]);
    expect(phraseValues(ast)).toEqual(["server components"]);
    expect(tagValues(ast)).toEqual(["frontend"]);
    expect(domainValues(ast)).toEqual(["react.dev"]);
    expect(readStates(ast)).toEqual(["unread"]);
    expect(ratingFilters(ast)).toEqual([{ type: "rating", op: ">=", value: 8 }]);
    expect(ast.errors).toEqual([]);
  });

  it("keeps every rating: clause in filters (does not collapse to last)", () => {
    // Contrast with the legacy parser: this AST is meant for downstream
    // conjunction, so both survive and the evaluator decides.
    const ast = parseQuery("rating:>=5 rating:<=8");
    expect(ratingFilters(ast)).toEqual([
      { type: "rating", op: ">=", value: 5 },
      { type: "rating", op: "<=", value: 8 },
    ]);
  });

  it("stays out of `should` (reserved for future explicit-OR)", () => {
    const ast = parseQuery("foo bar tag:baz");
    expect(ast.should).toEqual([]);
  });
});

describe("parseQuery — unknown prefixes & robustness", () => {
  it("treats an unknown prefix as a bare term", () => {
    const ast = parseQuery("git:foo");
    expect(termValues(ast)).toEqual(["git:foo"]);
    expect(ast.errors).toEqual([]);
  });

  it("treats a leading colon as a bare term", () => {
    const ast = parseQuery(":foo");
    expect(termValues(ast)).toEqual([":foo"]);
  });

  it("does not throw on odd input", () => {
    expect(() => parseQuery('::::   " ""  ')).not.toThrow();
  });
});
