/**
 * Enrichment subsystem — deterministic offline detectors (content type,
 * tag suggestions) plus opt-in network-based meta fetcher and queue.
 *
 * Network side is gated behind `settings.networkEnrichmentEnabled` and
 * driven by an alarm in the service worker. Capture stays fast; enrichment
 * arrives later. See PHILOSOPHY.md §5.
 */

export { detectContentType } from "./contentType";
export {
  type EnrichOptions,
  type EnrichResult,
  enrichBookmark,
  mapOgTypeToContentType,
} from "./enrich";
export {
  _configureEnrichmentQueueForTests,
  _peekEnrichmentQueueForTests,
  _resetEnrichmentQueueForTests,
  DEFAULT_CONCURRENCY,
  DEFAULT_DELAY_MS,
  DEFAULT_STALE_AFTER_MS,
  DEFAULT_SWEEP_LIMIT,
  enqueueEnrichment,
  runEnrichmentSweep,
  type SweepOpts,
  type SweepResult,
} from "./enrichmentQueue";
export {
  FETCH_TIMEOUT_MS,
  fetchAndParseMeta,
  MAX_BYTES,
  type MetaResult,
  parseHtml,
  WORDS_PER_MINUTE,
} from "./fetcher";
export { detectLanguage, MIN_DETECT_LENGTH, normalizeLangTag } from "./languageDetect";
export {
  ENRICHMENT_ALARM_NAME,
  installEnrichmentAlarm,
  runEnrichmentSweepIfEnabled,
} from "./scheduleAlarm";
export { suggestTags, type TagSuggestion } from "./tagSuggestions";
