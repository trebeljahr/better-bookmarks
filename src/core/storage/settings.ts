import { DEFAULT_SETTINGS, type Settings } from "../../shared/types";

const SETTINGS_KEY = "__bb_settings__";

export async function getSettings(): Promise<Settings> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    return DEFAULT_SETTINGS;
  }
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  const stored = result[SETTINGS_KEY] as Partial<Settings> | undefined;
  if (!stored) return DEFAULT_SETTINGS;
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    canonicalizationOverrides: {
      ...DEFAULT_SETTINGS.canonicalizationOverrides,
      ...(stored.canonicalizationOverrides ?? {}),
    },
    healthEnabledScanners: {
      ...DEFAULT_SETTINGS.healthEnabledScanners,
      ...(stored.healthEnabledScanners ?? {}),
    },
    healthDismissedFindings:
      stored.healthDismissedFindings ?? DEFAULT_SETTINGS.healthDismissedFindings,
  };
}

export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next: Settings = {
    ...current,
    ...patch,
    canonicalizationOverrides: {
      ...current.canonicalizationOverrides,
      ...(patch.canonicalizationOverrides ?? {}),
    },
    healthEnabledScanners: {
      ...current.healthEnabledScanners,
      ...(patch.healthEnabledScanners ?? {}),
    },
    healthDismissedFindings: patch.healthDismissedFindings ?? current.healthDismissedFindings,
  };
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  }
  return next;
}
