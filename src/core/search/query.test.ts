import { describe, expect, it } from "vitest";
import { parseQuery, ratingMatches } from "./query";

describe("parseQuery", () => {
  it("returns an empty AST for empty input", () => {
    const q = parseQuery("");
    expect(q.bare).toEqual([]);
    expect(q.tags).toEqual([]);
    expect(q.domains).toEqual([]);
    expect(q.statuses).toEqual([]);
    expect(q.rating).toBeNull();
    expect(q.errors).toEqual([]);
  });

  it("parses bare words and lowercases them", () => {
    const q = parseQuery("Diffusion Models");
    expect(q.bare).toEqual(["diffusion", "models"]);
  });

  it("parses tag: filter", () => {
    const q = parseQuery("tag:AI");
    expect(q.tags).toEqual(["ai"]);
    expect(q.bare).toEqual([]);
  });

  it("parses domain: filter", () => {
    const q = parseQuery("domain:Example.COM");
    expect(q.domains).toEqual(["example.com"]);
  });

  it("parses is: status filters", () => {
    expect(parseQuery("is:unread").statuses).toEqual(["unread"]);
    expect(parseQuery("is:reading").statuses).toEqual(["reading"]);
    expect(parseQuery("is:read").statuses).toEqual(["read"]);
    expect(parseQuery("is:archived").statuses).toEqual(["archived"]);
  });

  it("treats unknown is: as an error and a bare word", () => {
    const q = parseQuery("is:nope");
    expect(q.statuses).toEqual([]);
    expect(q.bare).toEqual(["is:nope"]);
    expect(q.errors[0]).toMatch(/unknown status/);
  });

  it("parses rating: with all comparators", () => {
    expect(parseQuery("rating:5").rating).toEqual({ op: "=", value: 5 });
    expect(parseQuery("rating:=5").rating).toEqual({ op: "=", value: 5 });
    expect(parseQuery("rating:>=7").rating).toEqual({ op: ">=", value: 7 });
    expect(parseQuery("rating:>3").rating).toEqual({ op: ">", value: 3 });
    expect(parseQuery("rating:<=4").rating).toEqual({ op: "<=", value: 4 });
    expect(parseQuery("rating:<2").rating).toEqual({ op: "<", value: 2 });
  });

  it("flags malformed rating filter", () => {
    const q = parseQuery("rating:abc");
    expect(q.rating).toBeNull();
    expect(q.errors[0]).toMatch(/invalid rating/);
    expect(q.bare).toContain("rating:abc");
  });

  it("supports combined filters and bare words", () => {
    const q = parseQuery("react hooks tag:frontend domain:react.dev is:reading rating:>=8");
    expect(q.bare).toEqual(["react", "hooks"]);
    expect(q.tags).toEqual(["frontend"]);
    expect(q.domains).toEqual(["react.dev"]);
    expect(q.statuses).toEqual(["reading"]);
    expect(q.rating).toEqual({ op: ">=", value: 8 });
  });

  it("treats unknown 'name:' as a bare token (so weird inputs still work)", () => {
    const q = parseQuery("git:foo");
    expect(q.bare).toEqual(["git:foo"]);
  });

  it("treats bare-colon tokens (e.g. 'tag:') as bare words", () => {
    const q = parseQuery("tag:");
    expect(q.bare).toEqual(["tag:"]);
    expect(q.tags).toEqual([]);
  });

  it("collects multiple tag filters", () => {
    const q = parseQuery("tag:ai tag:paper");
    expect(q.tags).toEqual(["ai", "paper"]);
  });

  it("last rating filter wins", () => {
    const q = parseQuery("rating:1 rating:>=7");
    expect(q.rating).toEqual({ op: ">=", value: 7 });
  });
});

describe("ratingMatches", () => {
  it("returns true when filter is null", () => {
    expect(ratingMatches(null, null)).toBe(true);
    expect(ratingMatches(5, null)).toBe(true);
  });
  it("returns false when value is null and filter set", () => {
    expect(ratingMatches(null, { op: ">=", value: 5 })).toBe(false);
  });
  it("evaluates each comparator", () => {
    expect(ratingMatches(7, { op: "=", value: 7 })).toBe(true);
    expect(ratingMatches(7, { op: "=", value: 8 })).toBe(false);
    expect(ratingMatches(7, { op: ">=", value: 7 })).toBe(true);
    expect(ratingMatches(7, { op: ">", value: 7 })).toBe(false);
    expect(ratingMatches(7, { op: "<=", value: 7 })).toBe(true);
    expect(ratingMatches(7, { op: "<", value: 7 })).toBe(false);
  });
});
