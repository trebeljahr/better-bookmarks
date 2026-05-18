/**
 * Enrichment subsystem — deterministic, offline-only signals that fill in
 * metadata fields the user would otherwise have to type. Network-based
 * enrichment (og:tags, reading-time word counts) lives in a future
 * `fetcher` module and is opt-in.
 */

export { detectContentType } from "./contentType";
export { suggestTags, type TagSuggestion } from "./tagSuggestions";
