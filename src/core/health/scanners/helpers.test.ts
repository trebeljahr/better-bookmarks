/**
 * Unit tests for the eTLD+1 extractor and title-similarity helpers.
 * The fixture-driven scanner tests in `health.test.ts` rely on these
 * staying correct; pin them down with direct cases here.
 */
import { describe, expect, it } from "vitest";
import { etldPlusOne } from "./etld";
import { damerauLevenshtein, normalizeTitle, titleSimilarity } from "./titleSimilarity";

describe("etldPlusOne", () => {
  it("returns last two labels for simple TLDs", () => {
    expect(etldPlusOne("www.medium.com")).toBe("medium.com");
    expect(etldPlusOne("medium.com")).toBe("medium.com");
    expect(etldPlusOne("arxiv.org")).toBe("arxiv.org");
    expect(etldPlusOne("blog.example.com")).toBe("example.com");
  });

  it("handles compound suffixes correctly", () => {
    expect(etldPlusOne("example.co.uk")).toBe("example.co.uk");
    expect(etldPlusOne("blog.example.co.uk")).toBe("example.co.uk");
    expect(etldPlusOne("example.com.au")).toBe("example.com.au");
  });

  it("lowercases input", () => {
    expect(etldPlusOne("WWW.Example.COM")).toBe("example.com");
  });

  it("returns short hostnames unchanged", () => {
    expect(etldPlusOne("localhost")).toBe("localhost");
  });
});

describe("normalizeTitle", () => {
  it("lowercases and collapses punctuation/whitespace", () => {
    expect(normalizeTitle("  Understanding   Closures, in JavaScript! ")).toBe(
      "understanding closures in javascript",
    );
  });

  it("returns empty for whitespace-only input", () => {
    expect(normalizeTitle("   \t  ")).toBe("");
  });
});

describe("damerauLevenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(damerauLevenshtein("abc", "abc")).toBe(0);
  });

  it("counts a transposition as one edit (vs Levenshtein's two)", () => {
    expect(damerauLevenshtein("form", "from")).toBe(1);
  });

  it("handles empty strings", () => {
    expect(damerauLevenshtein("", "abc")).toBe(3);
    expect(damerauLevenshtein("abc", "")).toBe(3);
    expect(damerauLevenshtein("", "")).toBe(0);
  });
});

describe("titleSimilarity", () => {
  it("returns 1.0 for normalised-equal titles", () => {
    expect(titleSimilarity("Hello World!", "  hello   world  ")).toBe(1);
  });

  it("returns high similarity for casing-only diffs", () => {
    expect(
      titleSimilarity("Understanding JavaScript", "Understanding Javascript"),
    ).toBeGreaterThanOrEqual(0.9);
  });

  it("returns low similarity for unrelated titles", () => {
    expect(titleSimilarity("Quantum mechanics", "Banana bread recipe")).toBeLessThan(0.5);
  });
});
