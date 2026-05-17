/**
 * Search subsystem — public API.
 *
 * UI code and hooks should import from this barrel only. Internals
 * (postings store layout, ranking formula) can change without callers
 * caring.
 */

export { indexBookmark, reindexAll, removeBookmark } from "./indexer";
export { parseQuery, type Query, type RatingFilter, type RatingOp } from "./query";
export { runQuery, type SearchOptions, search } from "./runner";
export {
  ensureSearchIndexInitialized,
  resetSearchWiringForTests,
  wireSearchIndexer,
} from "./wire";
