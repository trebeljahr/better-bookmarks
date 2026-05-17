import { describe, expect, it } from "vitest";
import { FIXTURES, REJECTION_FIXTURES } from "./fixtures";
import { canonicalize } from "./index";

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

  it("populates domain on success", () => {
    const result = canonicalize("https://example.com/foo?bar=1");
    if (!result.ok) throw new Error("expected ok");
    expect(result.domain).toBe("example.com");
  });
});
