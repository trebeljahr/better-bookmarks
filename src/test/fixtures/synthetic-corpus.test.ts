import { describe, expect, it } from "vitest";
import { buildSyntheticCorpus } from "./synthetic-corpus";

describe("buildSyntheticCorpus", () => {
  it("produces a small corpus with the shape the docs promise", () => {
    const { tree, bookmarks, stats } = buildSyntheticCorpus({ size: 200 });

    // Tree shape: single root with Bookmarks bar + Other bookmarks children.
    expect(tree).toHaveLength(1);
    const [root] = tree;
    expect(root!.id).toBe("0");
    expect(root!.children?.map((c) => c.title)).toEqual(["Bookmarks bar", "Other bookmarks"]);

    // Node counts line up with declared stats.
    expect(stats.urlNodesInTree).toBe(200);
    expect(stats.uniqueCanonicalUrls).toBe(bookmarks.length);
    expect(stats.duplicateVariants).toBe(stats.urlNodesInTree - stats.uniqueCanonicalUrls);
    expect(stats.duplicateVariants).toBeGreaterThan(0);

    // Deep branch guarantee.
    expect(stats.maxFolderDepth).toBe(8);

    // Bookmarks all canonicalized and non-empty.
    for (const b of bookmarks) {
      expect(b.id).toMatch(/^bm-\d{7}$/);
      expect(b.canonicalUrl.startsWith("http")).toBe(true);
      expect(b.domain.length).toBeGreaterThan(0);
      expect(b.capturedFrom).toBe("chrome-import");
    }
  });

  it("is deterministic across builds with the same seed", () => {
    const a = buildSyntheticCorpus({ size: 500 });
    const b = buildSyntheticCorpus({ size: 500 });
    expect(a.stats).toEqual(b.stats);
    expect(a.bookmarks.map((b) => b.canonicalUrl)).toEqual(b.bookmarks.map((b) => b.canonicalUrl));
  });

  it("changes deterministically with a different seed", () => {
    const a = buildSyntheticCorpus({ size: 500, seed: 1 });
    const b = buildSyntheticCorpus({ size: 500, seed: 2 });
    expect(a.bookmarks.map((b) => b.canonicalUrl)).not.toEqual(
      b.bookmarks.map((b) => b.canonicalUrl),
    );
  });

  it("emits tracking-param variants that canonicalize to their base", () => {
    const { tree, bookmarks } = buildSyntheticCorpus({ size: 2_000 });
    const rawUrls: string[] = [];
    const visit = (n: chrome.bookmarks.BookmarkTreeNode): void => {
      if (n.url) rawUrls.push(n.url);
      for (const c of n.children ?? []) visit(c);
    };
    for (const t of tree) visit(t);
    // At least one recognisable tracking pattern from each family shows up.
    const patterns = [/utm_source=/, /[?&]s=\d+/, /[?&]t=\d+s?/, /fbclid=/];
    for (const p of patterns) {
      expect(rawUrls.some((u) => p.test(u))).toBe(true);
    }
    // Every canonical URL in bookmarks[] is unique.
    const seen = new Set<string>();
    for (const b of bookmarks) {
      expect(seen.has(b.canonicalUrl)).toBe(false);
      seen.add(b.canonicalUrl);
    }
  });

  it("emits at least one control-char title (edge-case sanitization surface)", () => {
    const { tree, stats } = buildSyntheticCorpus({ size: 2000 });
    expect(stats.edgeCaseTitles).toBeGreaterThan(0);
    // Char-code sweep instead of a control-char regex — biome's
    // `noControlCharactersInRegex` rule (rightly) flags the literal form.
    const hasControlChar = (s: string): boolean => {
      for (let i = 0; i < s.length; i++) {
        const code = s.charCodeAt(i);
        // C0 controls except TAB/LF/CR, plus DEL.
        if ((code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) || code === 0x7f) {
          return true;
        }
      }
      return false;
    };
    let hasControl = false;
    const visit = (n: chrome.bookmarks.BookmarkTreeNode): void => {
      if (n.title && hasControlChar(n.title)) hasControl = true;
      for (const c of n.children ?? []) visit(c);
    };
    for (const t of tree) visit(t);
    expect(hasControl).toBe(true);
  });
});
