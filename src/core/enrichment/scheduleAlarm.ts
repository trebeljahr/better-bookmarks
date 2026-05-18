/**
 * Enrichment alarm wiring. Schedules a recurring chrome.alarms entry so the
 * service worker periodically sweeps for stale bookmarks.
 *
 * Idempotent: chrome.alarms.create replaces any existing alarm of the same
 * name. Disabled-state clears the alarm.
 */

import { getSettings } from "../storage/settings";
import { runEnrichmentSweep, type SweepResult } from "./enrichmentQueue";

export const ENRICHMENT_ALARM_NAME = "bb:enrichment-sweep";

export async function installEnrichmentAlarm(): Promise<void> {
  const settings = await getSettings();
  if (!settings.networkEnrichmentEnabled) {
    try {
      await chrome.alarms.clear(ENRICHMENT_ALARM_NAME);
    } catch (err) {
      console.warn("installEnrichmentAlarm: clear failed", err);
    }
    return;
  }
  const periodInMinutes = settings.enrichmentSweepIntervalMin || 720;
  chrome.alarms.create(ENRICHMENT_ALARM_NAME, { periodInMinutes });
}

/**
 * Alarm handler entrypoint. Reads current settings, no-ops when network
 * enrichment is disabled, otherwise runs one sweep capped at the
 * configured batch size.
 */
export async function runEnrichmentSweepIfEnabled(): Promise<SweepResult | null> {
  const settings = await getSettings();
  if (!settings.networkEnrichmentEnabled) return null;
  return runEnrichmentSweep({ limit: settings.enrichmentBatchSize });
}
