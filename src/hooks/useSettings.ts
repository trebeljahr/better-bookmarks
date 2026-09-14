/**
 * useSettings — read-only view over `chrome.storage.local` settings.
 *
 * Loads once on mount, then listens to `chrome.storage.onChanged` so a
 * change made in the options page (or another tab) propagates without
 * a manual refresh. Falls back to `DEFAULT_SETTINGS` when Chrome APIs
 * are unavailable (SSR-ish contexts, jsdom without the stub).
 */

import { useEffect, useState } from "react";
import { getSettings } from "../core/storage/settings";
import { DEFAULT_SETTINGS, type Settings } from "../shared/types";

export type UseSettingsResult = {
  settings: Settings;
  loading: boolean;
};

const SETTINGS_KEY = "__bb_settings__";

export function useSettings(): UseSettingsResult {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    getSettings()
      .then((s) => {
        if (!cancelled) {
          setSettings(s);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    // Subscribe to cross-tab changes so toggling `graphViewEnabled` in
    // the options page shows up in the overview without reloading.
    if (typeof chrome === "undefined" || !chrome.storage?.onChanged) return;
    const listener = (changes: Record<string, { newValue?: unknown }>, areaName: string) => {
      if (areaName !== "local") return;
      const change = changes[SETTINGS_KEY];
      if (!change || change.newValue === undefined) return;
      // Re-fetch through getSettings so the DEFAULT_SETTINGS merge
      // stays in one place — never trust the raw change payload.
      getSettings().then((s) => {
        if (!cancelled) setSettings(s);
      });
    };
    chrome.storage.onChanged.addListener(listener);
    return () => {
      cancelled = true;
      chrome.storage.onChanged.removeListener(listener);
    };
  }, []);

  return { settings, loading };
}
