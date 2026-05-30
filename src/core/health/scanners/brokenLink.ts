/**
 * anomaly.broken-link
 *
 * Opt-in scanner. Default off. Even when enabled, this scanner does
 * NOT make its own HEAD requests — it reads `bm.linkCheck` populated
 * by the existing dead-link sweep machinery in
 * `src/core/maintenance/deadLinkChecker.ts`. Pressing "Scan broken
 * links" from the Health page is a UI shortcut that calls
 * `runDeadLinkSweep` and then re-runs the local scan; that wiring
 * lives in the UI step, not here.
 *
 * Step 2 ships the read path: when the flag is on and a bookmark has
 * `linkCheck.ok === false`, we surface a finding. When the flag is
 * off (or the bookmark has never been checked) we emit nothing. No
 * network is touched from this scanner.
 *
 * See docs/BOOKMARK_HEALTH.md "anomaly-broken-link".
 */

import { ulid } from "ulid";
import type { Bookmark } from "../../../shared/types";
import type { HealthFinding, ScanContext, Scanner } from "../types";

export const ANOMALY_BROKEN_LINK: Scanner = {
  id: "anomaly.broken-link",
  label: "Broken link (HTTP HEAD)",
  kind: "anomaly-broken-link",
  defaultSeverity: "warn",
  enabledByDefault: false,
  appliesTo: (bm: Bookmark) =>
    // Pre-filter is per-bookmark. The enable gate
    // (settings.healthBrokenLinkCheckEnabled) lives in `scan` so we
    // honour the flag even when callers force this scanner on via
    // `scannerIds`.
    bm.linkCheck !== undefined && bm.linkCheck.ok === false,
  scan: async (bookmarks: Bookmark[], ctx: ScanContext): Promise<HealthFinding[]> => {
    if (!getBrokenLinkFlag(ctx)) return [];

    const findings: HealthFinding[] = [];
    for (const bm of bookmarks) {
      if (!bm.linkCheck || bm.linkCheck.ok !== false) continue;
      const status = bm.linkCheck.httpStatus ?? "network-error";
      findings.push({
        id: ulid(),
        kind: "anomaly-broken-link",
        scannerId: "anomaly.broken-link",
        severity: "warn",
        message: `Link check failed (${status}): ${bm.canonicalUrl}`,
        bookmarkIds: [bm.id],
        primaryBookmarkId: bm.id,
        details: {
          fingerprint: fingerprintForOne(bm.id),
          httpStatus: bm.linkCheck.httpStatus ?? null,
          reason: bm.linkCheck.reason ?? null,
          checkedAt: bm.linkCheck.checkedAt,
        },
        suggestedAction: { type: "delete-bookmark", bookmarkId: bm.id },
        dismissedAt: null,
        createdAt: ctx.now,
      });
    }
    return findings;
  },
};

/**
 * Tolerant settings reader. Step 1 didn't extend Settings with the
 * health flags yet — that lands in a later step. Until then we read
 * structurally and default to false.
 */
function getBrokenLinkFlag(ctx: ScanContext): boolean {
  const settings = ctx.settings as { healthBrokenLinkCheckEnabled?: boolean };
  return settings.healthBrokenLinkCheckEnabled === true;
}

function fingerprintForOne(bookmarkId: string): string {
  return bookmarkId;
}
