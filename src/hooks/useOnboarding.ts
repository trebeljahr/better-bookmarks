/**
 * useOnboarding — read the first-install onboarding flag and expose
 * dismiss/complete actions that clear it.
 *
 * The background service worker flips `onboardingPending` to true on a
 * fresh install (`runtime.onInstalled` with `reason === "install"`). The
 * overview page reads it on mount to decide whether to render
 * `OnboardingModal`. Dismiss/Complete both clear the flag so the modal
 * never returns; the hook keeps its local `pending` state in sync so
 * the closed modal doesn't flash back before the storage write finishes.
 */

import { useCallback, useEffect, useState } from "react";
import { getOnboardingState, completeOnboarding as writeComplete } from "../core/onboarding/state";

export type UseOnboardingResult = {
  pending: boolean;
  loading: boolean;
  dismiss: () => Promise<void>;
  complete: () => Promise<void>;
};

export function useOnboarding(): UseOnboardingResult {
  const [pending, setPending] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    getOnboardingState()
      .then((state) => {
        if (cancelled) return;
        setPending(state.pending);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const clear = useCallback(async () => {
    // Optimistically hide the modal so React tears it down before the
    // async storage write resolves — otherwise the close animation
    // races the promise and can flicker.
    setPending(false);
    await writeComplete();
  }, []);

  return { pending, loading, dismiss: clear, complete: clear };
}
