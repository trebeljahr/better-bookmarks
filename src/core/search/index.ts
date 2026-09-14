/**
 * Search subsystem — public API.
 *
 * UI code and hooks should import from this barrel only. Internals
 * (postings store layout, ranking formula) can change without callers
 * caring.
 */

export {
  buildInvertedIndex,
  fullReindex,
  indexBookmark,
  reindexAll,
  removeBookmark,
  removeFromIndex,
  type SearchIndexField,
} from "./indexer";
export { parseQuery, type Query, type RatingFilter, type RatingOp } from "./query";
export { runQuery, type SearchOptions, search } from "./runner";
export { tokenizeInverted } from "./tokenize";
export {
  ensureInvertedIndexInitialized,
  ensureSearchIndexInitialized,
  flushInvertedIndexNowForTests,
  isSearchIndexerSuppressed,
  pendingInvertedIndexTimersForTests,
  resetInvertedWiringForTests,
  resetSearchWiringForTests,
  setSearchIndexerSuppressed,
  wireInvertedIndexer,
  wireSearchIndexer,
} from "./wire";
