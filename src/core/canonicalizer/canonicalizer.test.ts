import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../shared/types";
import { FIXTURES, REJECTION_FIXTURES } from "./fixtures";
import { canonicalize, overridesFromSettings } from "./index";
import { RULE_REGISTRY, ruleDescription } from "./rules";

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

describe("canonicalize — rule-id emission", () => {
  // Each row: an input URL and the set of rule ids we expect on
  // `appliedRules`. Assertion is subset-on-set (order independent, no
  // extras allowed) so a new rule that fires here would fail loudly.
  const RULE_CASES: ReadonlyArray<{
    name: string;
    input: string;
    expected: readonly string[];
  }> = [
    // ── global ────────────────────────────────────────────────
    // Host case and default port are normalised by the URL parser
    // itself, so no rule fires for those two — asserted below via
    // the "emits nothing for an already-canonical url" case.
    {
      name: "strips tracking params (utm)",
      input: "https://example.com/a?utm_source=x",
      expected: ["global:strip-tracking-params"],
    },
    {
      name: "strips text fragment",
      input: "https://example.com/page#:~:text=hi",
      expected: ["global:strip-text-fragment"],
    },
    {
      name: "sorts reordered query params",
      input: "https://example.com/?b=2&a=1",
      expected: ["global:sort-query-params"],
    },
    {
      name: "emits nothing for an already-canonical url",
      input: "https://example.com/foo?a=1&b=2",
      expected: [],
    },
    // ── youtube ───────────────────────────────────────────────
    {
      name: "youtube: t= start-time",
      input: "https://www.youtube.com/watch?v=abc123XYZ_-&t=42s",
      expected: ["youtube:strip-non-video-params"],
    },
    {
      name: "youtube: watch-later list",
      input: "https://www.youtube.com/watch?v=abc123XYZ_-&list=WL",
      expected: ["youtube:strip-watch-later"],
    },
    {
      name: "youtube: youtu.be short link",
      input: "https://youtu.be/abc123XYZ_-",
      expected: ["youtube:youtu-be-expand"],
    },
    {
      name: "youtube: shorts",
      input: "https://www.youtube.com/shorts/abc123XYZ_-",
      expected: ["youtube:short-form-expand"],
    },
    {
      name: "youtube: mobile subdomain",
      input: "https://m.youtube.com/watch?v=abc123XYZ_-",
      expected: ["youtube:normalize-host"],
    },
    // ── twitter/x ─────────────────────────────────────────────
    {
      name: "twitter → x rewrite",
      input: "https://twitter.com/user/status/1",
      expected: ["twitter:rewrite-to-x"],
    },
    {
      name: "twitter: s= share param",
      input: "https://x.com/user/status/1?s=20",
      expected: ["twitter:strip-share-params"],
    },
    // ── reddit ────────────────────────────────────────────────
    {
      name: "reddit: old.subdomain → www",
      input: "https://old.reddit.com/r/programming/comments/abc/title",
      expected: ["reddit:normalize-host"],
    },
    {
      name: "reddit: share_id",
      input: "https://www.reddit.com/r/programming/comments/abc/title?share_id=xyz",
      expected: ["reddit:strip-share-params"],
    },
    // ── github ────────────────────────────────────────────────
    {
      name: "github: repo trailing slash",
      input: "https://github.com/user/repo/",
      expected: ["github:strip-repo-root-slash"],
    },
    {
      name: "github: ?tab= on repo root",
      input: "https://github.com/user/repo?tab=readme",
      expected: ["github:strip-repo-root-noise"],
    },
    {
      name: "github: random fragment on issue",
      input: "https://github.com/user/repo/issues/42#header",
      expected: ["github:strip-issue-fragment"],
    },
    {
      name: "github: notification_referrer_id",
      input: "https://github.com/user/repo/pull/1?notification_referrer_id=abc",
      expected: ["github:strip-notification-referrer"],
    },
    {
      name: "github: ?type= on /issues listing",
      input: "https://github.com/user/repo/issues?type=open",
      expected: ["github:strip-list-type-param"],
    },
    // ── wikipedia ─────────────────────────────────────────────
    {
      name: "wikipedia: section fragment",
      input: "https://en.wikipedia.org/wiki/Foo#History",
      expected: ["wikipedia:strip-section-fragment"],
    },
    // ── amazon ────────────────────────────────────────────────
    {
      name: "amazon: /gp/product collapse to /dp",
      input: "https://www.amazon.com/gp/product/B0ABCDEFGH",
      expected: ["amazon:collapse-to-dp-asin"],
    },
    {
      name: "amazon: strips all query",
      input: "https://www.amazon.com/dp/B0ABCDEFGH?keywords=x",
      expected: ["amazon:strip-all-query"],
    },
    // ── medium ────────────────────────────────────────────────
    // `source=` also lives in GLOBAL_TRACKING_PARAMS and is stripped
    // by the global rule before medium's strategy runs. Use `sk=`
    // (medium-specific "secret" share link) so the domain rule is
    // the one that actually fires.
    {
      name: "medium: sk share link",
      input: "https://medium.com/@user/post?sk=abc123",
      expected: ["medium:strip-share-params"],
    },
    // ── stackoverflow ─────────────────────────────────────────
    {
      name: "stackoverflow: cruft after slug",
      input: "https://stackoverflow.com/questions/12345/how-to-do-thing/12346",
      expected: ["stackoverflow:strip-slug-cruft"],
    },
    {
      name: "stackoverflow: non-answer fragment",
      input: "https://stackoverflow.com/questions/12345/how-to-do-thing#comment-1",
      expected: ["stackoverflow:strip-non-answer-fragment"],
    },
    // ── google ────────────────────────────────────────────────
    {
      name: "google docs: /view → /edit and drops ?usp",
      input: "https://docs.google.com/document/d/abc_DEF-123/view?usp=sharing",
      expected: ["google:docs-normalize-edit"],
    },
    // ── arxiv ─────────────────────────────────────────────────
    {
      name: "arxiv: /pdf → /abs",
      input: "https://arxiv.org/pdf/2401.12345",
      expected: ["arxiv:pdf-to-abs"],
    },
    {
      name: "arxiv: /pdf/<id>.pdf drops .pdf and rewrites",
      input: "https://arxiv.org/pdf/2401.12345.pdf",
      expected: ["arxiv:pdf-to-abs", "arxiv:strip-pdf-extension"],
    },
    // ── hackernews ────────────────────────────────────────────
    {
      name: "hackernews: fragment",
      input: "https://news.ycombinator.com/item?id=42#up_43",
      expected: ["hackernews:strip-fragment"],
    },
  ];

  for (const { name, input, expected } of RULE_CASES) {
    it(name, () => {
      const result = canonicalize(input);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect([...result.appliedRules].sort()).toEqual([...expected].sort());
    });
  }

  it("emits multiple rule ids when several transforms fire", () => {
    // youtu.be with tracking param and text fragment.
    const result = canonicalize("https://youtu.be/abc123XYZ_-?utm_source=x&t=10#:~:text=hi");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(new Set(result.appliedRules)).toEqual(
      new Set([
        "global:strip-tracking-params",
        "youtube:youtu-be-expand",
        "youtube:strip-non-video-params",
      ]),
    );
  });

  it("does not double-emit rules that could fire more than once per url", () => {
    // Two tracking params — one emit, not two.
    const result = canonicalize("https://example.com/a?utm_source=x&fbclid=y");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.appliedRules.filter((r) => r === "global:strip-tracking-params")).toHaveLength(1);
  });

  it("honours user override stripped params via the same rule id", () => {
    const result = canonicalize("https://example.com/?drop=no", {
      extraStrippedParams: ["drop"],
      perDomain: {},
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.appliedRules).toContain("global:strip-tracking-params");
  });

  it("appliedRules is stable on re-canonicalization (idempotency)", () => {
    for (const { input } of FIXTURES) {
      const first = canonicalize(input);
      if (!first.ok) throw new Error(`fixture ${input} should canonicalize`);
      const second = canonicalize(first.canonical);
      if (!second.ok) throw new Error(`re-canonicalize should canonicalize`);
      // Rerunning on an already-canonical URL should not re-emit
      // any of the rules that fired on the first pass. Domain host
      // rewrites (e.g. reddit:normalize-host firing because we now
      // start at www.reddit.com — a no-op) are guarded by an
      // "originalHost !==" check, so the second run's appliedRules
      // is a strict subset (usually empty).
      for (const id of second.appliedRules) {
        expect(first.appliedRules).toContain(id);
      }
    }
  });
});

describe("RULE_REGISTRY", () => {
  it("every rule id emitted by the canonicaliser has a description", () => {
    // Sweep every fixture, collect every rule id we actually emit, and
    // demand a registry entry. Guards against renaming a rule in a
    // strategy but forgetting the description.
    const seen = new Set<string>();
    for (const { input } of FIXTURES) {
      const result = canonicalize(input);
      if (!result.ok) continue;
      for (const id of result.appliedRules) seen.add(id);
    }
    // Fixtures do not cover every rule (locale prefix stripping is off
    // by default) — union with the whole registry so we still assert
    // description shape on those.
    for (const id of Object.keys(RULE_REGISTRY)) seen.add(id);

    for (const id of seen) {
      const rule = RULE_REGISTRY[id];
      expect(rule, `missing RULE_REGISTRY entry for ${id}`).toBeDefined();
      expect(rule.id).toBe(id);
      expect(rule.description.length).toBeGreaterThan(20);
    }
  });

  it("ruleDescription() falls back to the id for unknown rules", () => {
    // The UI never crashes if a strategy invents a new id without
    // registering it. The unregistered id itself is a serviceable
    // fallback string.
    expect(ruleDescription("not-a-real-rule-id")).toBe("not-a-real-rule-id");
  });
});
