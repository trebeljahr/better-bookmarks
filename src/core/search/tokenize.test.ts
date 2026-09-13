import { describe, expect, it } from "vitest";
import { tokenize, tokenizeDomain, tokenizeInverted } from "./tokenize";

describe("tokenize", () => {
  it("returns empty array for null/undefined/empty", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize(null)).toEqual([]);
    expect(tokenize(undefined)).toEqual([]);
  });

  it("lowercases tokens", () => {
    expect(tokenize("Hello World")).toEqual(["hello", "world"]);
    expect(tokenize("MiXeD CaSe FOO")).toEqual(["mixed", "case", "foo"]);
  });

  it("splits on whitespace", () => {
    expect(tokenize("one two   three\nfour\tfive")).toEqual([
      "one",
      "two",
      "three",
      "four",
      "five",
    ]);
  });

  it("strips most punctuation", () => {
    expect(tokenize("Hello, world! How's it going?")).toEqual([
      "hello",
      "world",
      "how",
      "s",
      "it",
      "going",
    ]);
  });

  it("keeps inline punctuation in tokens", () => {
    expect(tokenize("node.js vue.js api/v1 snake_case kebab-case")).toEqual([
      "node.js",
      "vue.js",
      "api/v1",
      "snake_case",
      "kebab-case",
    ]);
  });

  it("strips wrapping punctuation", () => {
    expect(tokenize("-foo- ::bar:: .baz.")).toEqual(["foo", "bar", "baz"]);
  });

  it("tokenizes a URL into domain labels and path segments", () => {
    const tokens = tokenize("https://en.wikipedia.org/wiki/Diffusion_model");
    expect(tokens).toContain("en.wikipedia.org");
    expect(tokens).toContain("en");
    expect(tokens).toContain("wikipedia");
    expect(tokens).toContain("org");
    expect(tokens).toContain("wiki");
    expect(tokens).toContain("diffusion_model");
    // and the constituent label split:
    expect(tokens).toContain("diffusion");
    expect(tokens).toContain("model");
  });

  it("handles URLs embedded in free-text", () => {
    const tokens = tokenize("check out https://github.com/foo/bar awesome stuff");
    expect(tokens).toContain("check");
    expect(tokens).toContain("out");
    expect(tokens).toContain("github.com");
    expect(tokens).toContain("github");
    expect(tokens).toContain("foo");
    expect(tokens).toContain("bar");
    expect(tokens).toContain("awesome");
    expect(tokens).toContain("stuff");
  });

  it("survives garbage / unicode-only / pure punctuation input", () => {
    expect(tokenize("!!! ??? ...")).toEqual([]);
  });

  it("handles numbers", () => {
    expect(tokenize("react 17 vs react 19")).toEqual(["react", "17", "vs", "react", "19"]);
  });
});

describe("tokenizeInverted", () => {
  it("returns empty array for null/undefined/empty", () => {
    expect(tokenizeInverted("")).toEqual([]);
    expect(tokenizeInverted(null)).toEqual([]);
    expect(tokenizeInverted(undefined)).toEqual([]);
  });

  it("lowercases tokens", () => {
    expect(tokenizeInverted("Hello World")).toEqual(["hello", "world"]);
  });

  it("splits on whitespace and punctuation", () => {
    expect(tokenizeInverted("one, two! three?four/five")).toEqual([
      "one",
      "two",
      "three",
      "four",
      "five",
    ]);
  });

  it("enforces min length 2 (drops single-letter tokens)", () => {
    // "how's it going" → ["how", "s", "it", "going"] via the legacy tokenizer.
    // The inverted-index tokenizer drops the length-1 "s".
    expect(tokenizeInverted("how's it going")).toEqual(["how", "it", "going"]);
    expect(tokenizeInverted("a b cd e f gh")).toEqual(["cd", "gh"]);
  });

  it("keeps letters followed by digits (word17) but not pure digits", () => {
    // Spec regex is \p{L}+\p{N}*, so pure digits do NOT match; a digit
    // that leads the token (`2v`) matches only the trailing letters,
    // which then fail the min-length-2 check.
    expect(tokenizeInverted("react17 vs 19 or v2 or 2v")).toEqual([
      "react17",
      "vs",
      "or",
      "v2",
      "or",
    ]);
    // Sanity: no bare "19" in output.
    expect(tokenizeInverted("react 19")).toEqual(["react"]);
  });

  it("tokenizes CJK characters (each ideograph is its own token via runs)", () => {
    // Chinese: 机器学习模型 = "machine learning model" — one contiguous run.
    expect(tokenizeInverted("机器学习模型")).toEqual(["机器学习模型"]);
    // Mixed script: run breaks at the space.
    expect(tokenizeInverted("研究 论文")).toEqual(["研究", "论文"]);
    // Japanese: hiragana + katakana + kanji.
    expect(tokenizeInverted("こんにちは カタカナ 漢字")).toEqual([
      "こんにちは",
      "カタカナ",
      "漢字",
    ]);
    // Korean.
    expect(tokenizeInverted("안녕하세요 세계")).toEqual(["안녕하세요", "세계"]);
  });

  it("handles other Unicode scripts (Cyrillic, Greek, Arabic, accents)", () => {
    expect(tokenizeInverted("Привет мир")).toEqual(["привет", "мир"]);
    expect(tokenizeInverted("Καλημέρα κόσμε")).toEqual(["καλημέρα", "κόσμε"]);
    expect(tokenizeInverted("مرحبا بالعالم")).toEqual(["مرحبا", "بالعالم"]);
    expect(tokenizeInverted("Café résumé naïve")).toEqual(["café", "résumé", "naïve"]);
  });

  it("skips emoji entirely — they produce no tokens", () => {
    expect(tokenizeInverted("🚀🔥💯")).toEqual([]);
    expect(tokenizeInverted("hello 🚀 world")).toEqual(["hello", "world"]);
    expect(tokenizeInverted("👨‍👩‍👧‍👦 family")).toEqual(["family"]);
  });

  it("strips inline punctuation instead of keeping it in tokens", () => {
    // Legacy tokenizer keeps `node.js` as one token; the inverted tokenizer
    // splits on the dot because `.` is not a letter/digit.
    expect(tokenizeInverted("node.js vue.js api/v1")).toEqual([
      "node",
      "js",
      "vue",
      "js",
      "api",
      "v1",
    ]);
  });

  it("survives pure-punctuation and control-character input", () => {
    expect(tokenizeInverted("!!! ??? ...")).toEqual([]);
    expect(tokenizeInverted("\t\n \r")).toEqual([]);
  });
});

describe("tokenizeDomain", () => {
  it("returns empty for null/empty", () => {
    expect(tokenizeDomain("")).toEqual([]);
    expect(tokenizeDomain(null)).toEqual([]);
    expect(tokenizeDomain(undefined)).toEqual([]);
  });

  it("returns full host and each label", () => {
    expect(tokenizeDomain("en.wikipedia.org")).toEqual([
      "en.wikipedia.org",
      "en",
      "wikipedia",
      "org",
    ]);
  });

  it("lowercases", () => {
    expect(tokenizeDomain("GitHub.COM")).toEqual(["github.com", "github", "com"]);
  });
});
