import { describe, expect, it } from "vitest";
import { detectLanguage, MIN_DETECT_LENGTH, normalizeLangTag } from "./languageDetect";

// Realistic-length samples in the alphabets/scripts franc's trigram model
// tokenises differently. Each string is a title-plus-description-style
// fragment, comfortably above MIN_DETECT_LENGTH.
const FIXTURES = {
  en: "The quick brown fox jumps over the lazy dog and continues running through the forest.",
  de: "Der schnelle braune Fuchs springt über den faulen Hund und läuft weiter durch den Wald.",
  zh: "敏捷的棕色狐狸跳过了懒惰的狗还继续沿着森林里的小路一路向前奔跑而去。",
  ja: "速い茶色の狐が怠け者の犬を跳び越えて森の中の細い道を今日もどこまでも走り続けています。",
  ar: "الثعلب البني السريع يقفز فوق الكلب الكسول ويستمر في الجري عبر الغابة نحو النهر البعيد.",
} as const;

describe("detectLanguage", () => {
  it("detects English", () => {
    expect(detectLanguage(FIXTURES.en)).toBe("en");
  });

  it("detects German", () => {
    expect(detectLanguage(FIXTURES.de)).toBe("de");
  });

  it("detects Chinese (cmn → zh)", () => {
    expect(detectLanguage(FIXTURES.zh)).toBe("zh");
  });

  it("detects Japanese", () => {
    expect(detectLanguage(FIXTURES.ja)).toBe("ja");
  });

  it("detects Arabic (arb → ar)", () => {
    expect(detectLanguage(FIXTURES.ar)).toBe("ar");
  });

  it("returns null when input is shorter than MIN_DETECT_LENGTH", () => {
    const tooShort = "a".repeat(MIN_DETECT_LENGTH - 1);
    expect(detectLanguage(tooShort)).toBeNull();
  });

  it("returns null for whitespace-only input", () => {
    expect(detectLanguage("   \n\t   ")).toBeNull();
  });

  it("returns null for null / undefined / empty input", () => {
    expect(detectLanguage(null)).toBeNull();
    expect(detectLanguage(undefined)).toBeNull();
    expect(detectLanguage("")).toBeNull();
  });

  it("returns null when franc cannot decide the language", () => {
    // Numeric-only content carries no trigram signal; franc returns 'und'.
    const digits = "1234567890 1234567890 1234567890 1234567890";
    expect(detectLanguage(digits)).toBeNull();
  });
});

describe("normalizeLangTag", () => {
  it("returns the primary subtag lowercased for BCP47 tags", () => {
    expect(normalizeLangTag("en-US")).toBe("en");
    expect(normalizeLangTag("DE")).toBe("de");
    expect(normalizeLangTag("zh-Hans-CN")).toBe("zh");
  });

  it("maps a 3-letter primary subtag through the ISO 639-3 table", () => {
    expect(normalizeLangTag("cmn-Hans")).toBe("zh");
    expect(normalizeLangTag("arb")).toBe("ar");
  });

  it("returns null for empty / whitespace / non-language input", () => {
    expect(normalizeLangTag("")).toBeNull();
    expect(normalizeLangTag(null)).toBeNull();
    expect(normalizeLangTag(undefined)).toBeNull();
    expect(normalizeLangTag("   ")).toBeNull();
  });

  it("returns null when a 3-letter subtag has no known ISO 639-1 mapping", () => {
    expect(normalizeLangTag("xxx")).toBeNull();
  });
});
