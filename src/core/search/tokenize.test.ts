import { describe, expect, it } from "vitest";
import { tokenize, tokenizeDomain } from "./tokenize";

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
