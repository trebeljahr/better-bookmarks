import { getSettings } from "../storage/settings";

export const DEAD_LINK_ALARM_NAME = "bb:dead-link-sweep";

export async function installDeadLinkAlarm(): Promise<void> {
  const settings = await getSettings();
  if (!settings.deadLinkCheckEnabled) {
    try {
      await chrome.alarms.clear(DEAD_LINK_ALARM_NAME);
    } catch (err) {
      console.warn("installDeadLinkAlarm: clear failed", err);
    }
    return;
  }
  const periodInMinutes = settings.deadLinkSweepIntervalMin || 360;
  chrome.alarms.create(DEAD_LINK_ALARM_NAME, { periodInMinutes });
}
