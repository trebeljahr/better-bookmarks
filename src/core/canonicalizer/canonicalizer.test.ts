import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../shared/types";
import { FIXTURES, REJECTION_FIXTURES } from "./fixtures";
import { canonicalize, overridesFromSettings } from "./index";

describe("canonicalize", () => {
  for (const { name, input, expected } of FIXTURES) {
    it(name, () => {
      const result = canonicalize(input);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.canonical).toBe(expected);
      }
    });
  }

  for (const { name, input, reason } of REJECTION_FIXTURES) {
    it(name, () => {
      const result = canonicalize(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe(reason);
      }
    });
  }

  it("re-canonicalizing is idempotent", () => {
    for (const { input } of FIXTURES) {
      const first = canonicalize(input);
      if (!first.ok) throw new Error(`fixture ${input} should canonicalize`);
      const second = canonicalize(first.canonical);
      if (!second.ok) throw new Error(`re-canonicalize ${first.canonical} should canonicalize`);
      expect(second.canonical).toBe(first.canonical);
    }
  });

  it("honours user override stripped params", () => {
    const result = canonicalize("https://example.com/?keep=yes&drop=no", {
      extraStrippedParams: ["drop"],
      perDomain: {},
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.canonical).toBe("https://example.com/?keep=yes");
    }
  });

  it("honours per-domain keepFragments override", () => {
    const result = canonicalize("https://en.wikipedia.org/wiki/Foo#History", {
      extraStrippedParams: [],
      perDomain: { "en.wikipedia.org": { keepFragments: true } },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.canonical).toBe("https://en.wikipedia.org/wiki/Foo#History");
    }
  });

  it("wikipedia: strips fragment when keepWikipediaFragments is false (default)", () => {
    // D9: default branch. Setting off → per-page dedup ignores anchor.
    const result = canonicalize(
      "https://en.wikipedia.org/wiki/Foo#History",
      overridesFromSettings({ ...DEFAULT_SETTINGS, keepWikipediaFragments: false }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.canonical).toBe("https://en.wikipedia.org/wiki/Foo");
    }
  });

  it("wikipedia: keeps fragment when keepWikipediaFragments is true (any subdomain)", () => {
    // D9: setting flipped on → each `#section` is its own canonical URL,
    // for every wikipedia subdomain (no per-hostname config needed).
    const overrides = overridesFromSettings({
      ...DEFAULT_SETTINGS,
      keepWikipediaFragments: true,
    });
    const en = canonicalize("https://en.wikipedia.org/wiki/Foo#History", overrides);
    expect(en.ok).toBe(true);
    if (en.ok) expect(en.canonical).toBe("https://en.wikipedia.org/wiki/Foo#History");

    const de = canonicalize("https://de.wikipedia.org/wiki/Bar#Geschichte", overrides);
    expect(de.ok).toBe(true);
    if (de.ok) expect(de.canonical).toBe("https://de.wikipedia.org/wiki/Bar#Geschichte");
  });

  it("wikipedia global toggle only affects wikipedia hosts", () => {
    // Confirm the global flag is host-scoped, not a blanket keep-fragments.
    const overrides = overridesFromSettings({
      ...DEFAULT_SETTINGS,
      keepWikipediaFragments: true,
    });
    const news = canonicalize("https://news.ycombinator.com/item?id=1#up_2", overrides);
    expect(news.ok).toBe(true);
    if (news.ok) expect(news.canonical).toBe("https://news.ycombinator.com/item?id=1");
  });

  it("hackernews: strips fragment (D11)", () => {
    const result = canonicalize("https://news.ycombinator.com/item?id=42#up_43");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.canonical).toBe("https://news.ycombinator.com/item?id=42");
  });

  it("arxiv: keeps version suffix on /pdf → /abs collapse (D8)", () => {
    const versioned = canonicalize("https://arxiv.org/pdf/2401.12345v2");
    expect(versioned.ok).toBe(true);
    if (versioned.ok) expect(versioned.canonical).toBe("https://arxiv.org/abs/2401.12345v2");

    const unversioned = canonicalize("https://arxiv.org/pdf/2401.12345");
    expect(unversioned.ok).toBe(true);
    if (unversioned.ok) expect(unversioned.canonical).toBe("https://arxiv.org/abs/2401.12345");
  });

  it("populates domain on success", () => {
    const result = canonicalize("https://example.com/foo?bar=1");
    if (!result.ok) throw new Error("expected ok");
    expect(result.domain).toBe("example.com");
  });
});
