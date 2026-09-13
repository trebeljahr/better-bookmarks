/**
 * Language detection over short fragments of page text (title + og
 * description). Wraps `franc-min` — a ~5KB trigram-based detector that
 * covers the ~80 most-spoken languages — and normalises its ISO 639-3
 * output to the ISO 639-1 two-letter code we store on `Bookmark.language`.
 *
 * Detection is intentionally silent-fail: any of "input too short",
 * "franc undecided", "code has no ISO 639-1 mapping" collapses to `null`
 * so callers can treat detection as a best-effort hint rather than a
 * signal they have to branch on.
 *
 * Only invoked from the network enrichment path (see `parseHtml` in
 * `fetcher.ts`), which itself only runs when `networkEnrichmentEnabled`
 * is on and the page returned parseable HTML.
 */

import { franc } from "franc-min";

/**
 * Below this character count, franc's trigram model is unreliable enough
 * that we prefer to return `null` instead of a confident guess.
 */
export const MIN_DETECT_LENGTH = 20;

/**
 * ISO 639-3 → ISO 639-1. Populated for every language franc-min can
 * output (~82 codes), plus a couple of common macrolanguage aliases
 * (`nno`/`nob` → `no`, `azj`/`azb` → `az`). Codes not present here fall
 * through to `null` — better to store nothing than a code no downstream
 * consumer knows how to render.
 */
const ISO_639_3_TO_1: Record<string, string> = {
  afr: "af",
  als: "sq",
  amh: "am",
  arb: "ar",
  azb: "az",
  azj: "az",
  bel: "be",
  ben: "bn",
  bul: "bg",
  cat: "ca",
  ces: "cs",
  cmn: "zh",
  dan: "da",
  deu: "de",
  ell: "el",
  eng: "en",
  epo: "eo",
  est: "et",
  eus: "eu",
  fas: "fa",
  fin: "fi",
  fra: "fr",
  gle: "ga",
  guj: "gu",
  hat: "ht",
  hau: "ha",
  heb: "he",
  hin: "hi",
  hrv: "hr",
  hun: "hu",
  hye: "hy",
  ibo: "ig",
  ind: "id",
  ita: "it",
  jav: "jv",
  jpn: "ja",
  kan: "kn",
  kat: "ka",
  kaz: "kk",
  khm: "km",
  kin: "rw",
  kir: "ky",
  kor: "ko",
  lao: "lo",
  lat: "la",
  lav: "lv",
  lin: "ln",
  lit: "lt",
  lug: "lg",
  mal: "ml",
  mar: "mr",
  mkd: "mk",
  mlg: "mg",
  mon: "mn",
  msa: "ms",
  mya: "my",
  nld: "nl",
  nno: "no",
  nob: "no",
  nor: "no",
  npi: "ne",
  nya: "ny",
  ory: "or",
  pan: "pa",
  plt: "mg",
  pol: "pl",
  por: "pt",
  pus: "ps",
  ron: "ro",
  run: "rn",
  rus: "ru",
  sin: "si",
  slk: "sk",
  slv: "sl",
  sna: "sn",
  snd: "sd",
  som: "so",
  sot: "st",
  spa: "es",
  srp: "sr",
  ssw: "ss",
  sun: "su",
  swa: "sw",
  swe: "sv",
  tam: "ta",
  tel: "te",
  tgk: "tg",
  tgl: "tl",
  tha: "th",
  tir: "ti",
  tsn: "tn",
  tuk: "tk",
  tur: "tr",
  ukr: "uk",
  urd: "ur",
  uzn: "uz",
  vie: "vi",
  xho: "xh",
  yor: "yo",
  zho: "zh",
  zul: "zu",
};

/**
 * Detect the language of `text` and return its ISO 639-1 two-letter
 * code, or `null` when the input is too short, the detector is
 * undecided, or the detected language has no ISO 639-1 equivalent we
 * recognise.
 *
 * The caller is expected to have already assembled meaningful text —
 * typically `title + " " + description` from the page's meta — and to
 * treat the result as a hint, not an assertion.
 */
export function detectLanguage(text: string | null | undefined): string | null {
  const trimmed = (text ?? "").trim();
  if (trimmed.length < MIN_DETECT_LENGTH) return null;
  const code = franc(trimmed, { minLength: MIN_DETECT_LENGTH });
  if (!code || code === "und") return null;
  return ISO_639_3_TO_1[code] ?? null;
}

/**
 * Normalise a BCP47 / HTML `lang` value ("en-US", "de", "cmn-Hans") to
 * an ISO 639-1 two-letter code where possible. Falls back to the primary
 * subtag lowercased when the tag is already a two-letter code we do not
 * need to remap; returns `null` when the input is empty or clearly not a
 * language tag.
 */
export function normalizeLangTag(tag: string | null | undefined): string | null {
  const raw = (tag ?? "").trim().toLowerCase();
  if (!raw) return null;
  const primary = raw.split(/[-_]/)[0] ?? "";
  if (!primary) return null;
  if (primary.length === 2) return primary;
  if (primary.length === 3) return ISO_639_3_TO_1[primary] ?? null;
  return null;
}
