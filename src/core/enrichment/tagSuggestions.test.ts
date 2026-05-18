import { describe, expect, it } from "vitest";
import type { Bookmark } from "../../shared/types";
import { suggestTags } from "./tagSuggestions";

function mkBookmark(id: string, canonicalUrl: string, tags: string[]): Bookmark {
  const url = new URL(canonicalUrl);
  return {
    id,
    canonicalUrl,
    originalUrl: canonicalUrl,
    domain: url.hostname,
    title: id,
    description: "",
    note: "",
    tags,
    rating: null,
    necessaryTime: null,
    contentType: "unknown",
    language: null,
    status: "unread",
    readAt: null,
    createdAt: Date.parse(
      `2024-01-${(Number(id.replace(/\D/g, "")) % 28 || 1).toString().padStart(2, "0")}T00:00:00Z`,
    ),
    updatedAt: Date.parse(
      `2024-01-${(Number(id.replace(/\D/g, "")) % 28 || 1).toString().padStart(2, "0")}T00:00:00Z`,
    ),
    capturedFrom: "manual",
  };
}

describe("suggestTags", () => {
  it("returns URL-pattern tags for known domains", () => {
    const out = suggestTags("https://github.com/foo/bar", []);
    expect(out.find((s) => s.tag === "Code")).toBeTruthy();
  });

  it("returns empty for unparseable URLs", () => {
    expect(suggestTags("not-a-url", [])).toEqual([]);
  });

  it("returns empty for unknown domains with no corpus", () => {
    expect(suggestTags("https://random.example/", [])).toEqual([]);
  });

  it("excludes already-selected tags", () => {
    const out = suggestTags("https://github.com/foo/bar", [], {
      excludeAlreadySelected: ["Code"],
    });
    expect(out.find((s) => s.tag.toLowerCase() === "code")).toBeFalsy();
  });

  it("surfaces same-domain frequent tags", () => {
    const corpus = [
      mkBookmark("b1", "https://random.example/a", ["Cooking", "Recipe"]),
      mkBookmark("b2", "https://random.example/b", ["Cooking", "Recipe"]),
      mkBookmark("b3", "https://random.example/c", ["Cooking", "Recipe"]),
    ];
    const out = suggestTags("https://random.example/new", corpus);
    const tags = out.map((s) => s.tag);
    expect(tags).toContain("Cooking");
    expect(tags).toContain("Recipe");
    expect(out.find((s) => s.tag === "Cooking")?.reason).toBe("same-domain");
  });

  it("does not surface same-domain tags below fraction threshold", () => {
    const corpus = [
      mkBookmark("b1", "https://random.example/a", ["Rare"]),
      mkBookmark("b2", "https://random.example/b", []),
      mkBookmark("b3", "https://random.example/c", []),
    ];
    const out = suggestTags("https://random.example/new", corpus);
    expect(out.find((s) => s.tag === "Rare")).toBeFalsy();
  });

  it("ranks URL-pattern hints above same-domain", () => {
    const corpus = [
      mkBookmark("b1", "https://github.com/user/a", ["Custom"]),
      mkBookmark("b2", "https://github.com/user/b", ["Custom"]),
    ];
    const out = suggestTags("https://github.com/user/c", corpus);
    expect(out[0].tag).toBe("Code");
  });

  it("co-occurrence: tags that show up with pattern tags float up", () => {
    const corpus = [
      mkBookmark("b1", "https://github.com/a/a", ["Code", "AI"]),
      mkBookmark("b2", "https://github.com/b/b", ["Code", "AI"]),
      mkBookmark("b3", "https://github.com/c/c", ["Code", "AI"]),
      mkBookmark("b4", "https://github.com/d/d", ["Code", "AI"]),
    ];
    const out = suggestTags("https://github.com/new/repo", corpus, {
      excludeAlreadySelected: [],
      limit: 10,
    });
    const tagNames = out.map((s) => s.tag);
    expect(tagNames).toContain("AI");
  });

  it("respects the limit option", () => {
    const corpus = Array.from({ length: 20 }, (_, i) =>
      mkBookmark(`b${i}`, `https://random.example/${i}`, [
        "A",
        "B",
        "C",
        "D",
        "E",
        "F",
        "G",
        "H",
        "I",
      ]),
    );
    const out = suggestTags("https://random.example/new", corpus, { limit: 3 });
    expect(out.length).toBe(3);
  });
});
