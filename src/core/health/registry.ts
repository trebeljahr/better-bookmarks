/**
 * Scanner registry.
 *
 * The registration shape mirrors `DOMAIN_STRATEGIES` in
 * src/core/canonicalizer/index.ts: a single top-level constant, no
 * plugin/dynamic-registration pattern. Adding a scanner means
 * writing the file, importing the const here, and adding it to the
 * array passed into `buildRegistry`.
 *
 * See docs/BOOKMARK_HEALTH.md "Scanner registry" for the contract.
 */
import { ANOMALY_BROKEN_LINK } from "./scanners/brokenLink";
import {
  SOFT_DUP_ARXIV,
  SOFT_DUP_FUZZY_QUERY,
  SOFT_DUP_SHARED_CANONICAL,
  SOFT_DUP_TITLE_SIM,
  SOFT_DUP_YOUTUBE,
} from "./scanners/softDuplicate";
import {
  ANOMALY_FOLDER_TAG_MISMATCH,
  ANOMALY_TAG_CASING,
  STUB_EMPTY_TITLE,
  STUB_GENERIC_TITLE,
  STUB_NO_TAGS,
  STUB_ORPHAN,
} from "./scanners/stub";
import type { Scanner, ScannerRegistry } from "./types";

/**
 * Build a ScannerRegistry from a list of scanners. Throws on duplicate
 * ids so registration mistakes fail loud at module load rather than
 * shadowing each other silently at scan time.
 */
export function buildRegistry(scanners: Scanner[]): ScannerRegistry {
  const byId = new Map<string, Scanner>();
  for (const scanner of scanners) {
    if (byId.has(scanner.id)) {
      throw new Error(`Duplicate scanner id: ${scanner.id}`);
    }
    byId.set(scanner.id, scanner);
  }
  return { scanners: [...scanners], byId };
}

/** Look up a single scanner by id. Returns undefined if unknown. */
export function getScanner(registry: ScannerRegistry, id: string): Scanner | undefined {
  return registry.byId.get(id);
}

/** Stable, registration-order list of scanners. */
export function listScanners(registry: ScannerRegistry): Scanner[] {
  return registry.scanners;
}

/**
 * The default registry. Registration order matches the table in
 * docs/BOOKMARK_HEALTH.md "Scanner registry": stub-audit first, then
 * the soft-duplicate family. Tests rely on this order to assert
 * `scannerStats` keys; if you reorder, expect to update them.
 */
export const SCANNER_REGISTRY: ScannerRegistry = buildRegistry([
  STUB_EMPTY_TITLE,
  STUB_GENERIC_TITLE,
  STUB_NO_TAGS,
  STUB_ORPHAN,
  ANOMALY_TAG_CASING,
  ANOMALY_FOLDER_TAG_MISMATCH,
  ANOMALY_BROKEN_LINK,
  SOFT_DUP_SHARED_CANONICAL,
  SOFT_DUP_FUZZY_QUERY,
  SOFT_DUP_YOUTUBE,
  SOFT_DUP_TITLE_SIM,
  SOFT_DUP_ARXIV,
]);
