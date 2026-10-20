/**
 * useOnboarding — show the first-run hint once after a fresh install.
 *
 * The background service worker flips `onboardingPending` to true on a
 * fresh install (`runtime.onInstalled` with `reason === "install"`). The
 * overview page reads it on mount; when it is set, the hint becomes
 * visible and the flag is cleared straight away, so the hint shows on
 * this one visit only, whether or not it is ever closed. `hide` takes it
 * off the page for the rest of the visit.
 */

import { useCallback, useEffect, useState } from "react";
import { completeOnboarding, getOnboardingState } from "../core/onboarding/state";

export type UseOnboardingResult = {
  /** True while the first-run hint is on the page. */
  visible: boolean;
  loading: boolean;
  /** Close button, or the user started using the overview. */
  hide: () => void;
};

export function useOnboarding(): UseOnboardingResult {
  const [visible, setVisible] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    getOnboardingState()
      .then((state) => {
        if (cancelled) return;
        setLoading(false);
        if (!state.pending) return;
        setVisible(true);
        void completeOnboarding();
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const hide = useCallback(() => setVisible(false), []);

  return { visible, loading, hide };
}
