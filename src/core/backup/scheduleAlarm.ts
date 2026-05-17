/**
 * Backup alarm wiring. Schedules a recurring chrome.alarms entry that the
 * service worker listens for in background.ts.
 *
 * Idempotent: chrome.alarms.create replaces any existing alarm of the same
 * name, so calling this on every SW boot is fine.
 */

import { getSettings } from "../storage/settings";

export const BACKUP_ALARM_NAME = "bb:auto-backup";

/**
 * Install (or refresh) the auto-backup alarm based on current settings.
 * No-op + clears any existing alarm if `autoBackupEnabled` is false.
 */
export async function installBackupAlarm(): Promise<void> {
  const settings = await getSettings();
  if (!settings.autoBackupEnabled) {
    try {
      await chrome.alarms.clear(BACKUP_ALARM_NAME);
    } catch (err) {
      console.warn("installBackupAlarm: clear failed", err);
    }
    return;
  }
  const periodInMinutes = settings.autoBackupIntervalMin || 60 * 24;
  chrome.alarms.create(BACKUP_ALARM_NAME, { periodInMinutes });
}
