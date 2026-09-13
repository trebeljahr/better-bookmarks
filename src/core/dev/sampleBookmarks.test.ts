import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { canonicalize } from "@/core/canonicalizer";
import { countBookmarks, listBookmarks } from "@/core/storage/bookmarks";
import { getDB, resetDBForTests } from "@/core/storage/db";
import { buildSampleBookmarkSet, loadSampleBookmarks } from "./sampleBookmarks";

beforeEach(async () => {
  await getDB().bookmarks.clear();
});

afterEach(() => {
  resetDBForTests();
});

describe("dev sample bookmarks — shape invariants", () => {
  it("spans exactly ten domains after canonicalisation", () => {
    const entries = buildSampleBookmarkSet();
    const domains = new Set<string>();
    for (const e of entries) {
      const c = canonicalize(e.url);
      if (!c.ok) throw new Error(`sample URL failed to canonicalise: ${e.url}`);
      domains.add(c.domain);
    }
    // Ten canonical hosts. If a domain strategy ever rewrites one of ours
    // onto a different host (as twitter.com → x.com already does), the
    // count still needs to hold.
    expect(domains.size).toBe(10);
  });

  it("carries tracking-param dupes on three distinct domains", () => {
    const entries = buildSampleBookmarkSet();
    const perDomainAttempts = new Map<string, number>();
    const perDomainUnique = new Map<string, Set<string>>();
    for (const e of entries) {
      const c = canonicalize(e.url);
      if (!c.ok) continue;
      perDomainAttempts.set(c.domain, (perDomainAttempts.get(c.domain) ?? 0) + 1);
      if (!perDomainUnique.has(c.domain)) perDomainUnique.set(c.domain, new Set());
      perDomainUnique.get(c.domain)!.add(c.canonical);
    }
    // Three domains should show attempts > unique — the dedup demo.
    let dedupDomains = 0;
    for (const [domain, attempts] of perDomainAttempts) {
      const unique = perDomainUnique.get(domain)!.size;
      if (attempts > unique) dedupDomains += 1;
    }
    expect(dedupDomains).toBe(3);
  });

  it("collapses to exactly one hundred canonical URLs", () => {
    const entries = buildSampleBookmarkSet();
    const canonicalSet = new Set<string>();
    for (const e of entries) {
      const c = canonicalize(e.url);
      if (c.ok) canonicalSet.add(c.canonical);
    }
    expect(canonicalSet.size).toBe(100);
  });
});

describe("loadSampleBookmarks — DB round-trip", () => {
  it("populates IndexedDB with 100 unique bookmarks and reports the dedup delta", async () => {
    const report = await loadSampleBookmarks();

    // Every sample URL is public and shaped to pass canonicalize.
    expect(report.rejected).toBe(0);
    expect(report.errored).toBe(0);
    // 100 unique + 9 tracking-param dupes = 109 attempts.
    expect(report.attempted).toBe(109);
    expect(report.created).toBe(100);
    expect(report.merged).toBe(9);
    expect(report.dedupCollapsed).toBe(9);

    // And the DB agrees.
    expect(await countBookmarks()).toBe(100);
    const rows = await listBookmarks();
    const canonicalHosts = new Set(rows.map((r) => r.domain));
    expect(canonicalHosts.size).toBe(10);
  });

  it("is idempotent — running it twice does not double-insert", async () => {
    await loadSampleBookmarks();
    const second = await loadSampleBookmarks();
    // On the second run every attempt should merge onto an existing row.
    expect(second.created).toBe(0);
    expect(second.merged).toBe(109);
    expect(await countBookmarks()).toBe(100);
  });
});
