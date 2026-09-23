/**
 * First-install onboarding state.
 *
 * A brand-new install fires `chrome.runtime.onInstalled` with
 * `reason === "install"`. The background service worker forwards that
 * event to `handleInstalledEvent`, which flips `onboardingPending` to
 * true. The overview page reads this flag on mount and renders
 * `OnboardingModal` when it is set. Skip / Dismiss / Complete each
 * clear the flag and stamp `onboardingCompletedAt`.
 *
 * The three fields live at the top of `chrome.storage.local` (not
 * nested under `__bb_settings__`) so the background worker can flip
 * them without loading and rewriting the whole settings blob, and so
 * they survive independent settings migrations.
 *
 * Testing note: WXT's `defineBackground` is a build-time global and
 * cannot be executed under vitest, so `background.test.ts` exercises
 * this helper directly with a mocked `chrome.storage.local` instead of
 * booting the entrypoint. That keeps the install/update branch tested
 * without a browser harness.
 */

import { DEFAULT_ONBOARDING_STATE, type OnboardingState } from "../../shared/types";

export const ONBOARDING_PENDING_KEY = "onboardingPending";
export const ONBOARDING_INSTALLED_AT_KEY = "installedAt";
export const ONBOARDING_COMPLETED_AT_KEY = "onboardingCompletedAt";

/**
 * Shape of the object handed to `chrome.runtime.onInstalled` listeners.
 * We only care about `reason`; declared locally so tests don't need to
 * import the DOM chrome types.
 */
export type InstalledDetails = {
  reason: string;
  previousVersion?: string;
  id?: string;
};

function storageAvailable(): boolean {
  return typeof chrome !== "undefined" && !!chrome.storage?.local;
}

/**
 * Read the current onboarding state from `chrome.storage.local`. Falls
 * back to `DEFAULT_ONBOARDING_STATE` when chrome APIs are missing (SSR,
 * jsdom without the stub) or the storage read throws.
 */
export async function getOnboardingState(): Promise<OnboardingState> {
  if (!storageAvailable()) return { ...DEFAULT_ONBOARDING_STATE };
  try {
    const result = await chrome.storage.local.get([
      ONBOARDING_PENDING_KEY,
      ONBOARDING_INSTALLED_AT_KEY,
      ONBOARDING_COMPLETED_AT_KEY,
    ]);
    return {
      pending: Boolean(result[ONBOARDING_PENDING_KEY]),
      installedAt:
        typeof result[ONBOARDING_INSTALLED_AT_KEY] === "number"
          ? (result[ONBOARDING_INSTALLED_AT_KEY] as number)
          : 0,
      completedAt:
        typeof result[ONBOARDING_COMPLETED_AT_KEY] === "number"
          ? (result[ONBOARDING_COMPLETED_AT_KEY] as number)
          : 0,
    };
  } catch (err) {
    console.error("getOnboardingState failed", err);
    return { ...DEFAULT_ONBOARDING_STATE };
  }
}

/**
 * Handle a `chrome.runtime.onInstalled` event. Only `reason === "install"`
 * triggers the tour — updates, browser updates, and shared-module updates
 * are silent so an upgrade never re-shows the modal.
 *
 * Idempotent: if `onboardingPending` is already true (e.g. a very quick
 * uninstall/reinstall before the user opened the overview), we leave the
 * existing `installedAt` in place so the timestamp still reflects the
 * install that surfaced the modal.
 */
export async function handleInstalledEvent(details: InstalledDetails): Promise<void> {
  if (details.reason !== "install") return;
  if (!storageAvailable()) return;
  try {
    await chrome.storage.local.set({
      [ONBOARDING_PENDING_KEY]: true,
      [ONBOARDING_INSTALLED_AT_KEY]: Date.now(),
    });
  } catch (err) {
    console.error("handleInstalledEvent failed", err);
  }
}

/**
 * Mark onboarding as finished. Called by both the Skip and Get-started
 * buttons — the distinction between "skipped" and "completed" is not
 * tracked because it does not change behaviour (the modal never returns).
 */
export async function completeOnboarding(): Promise<void> {
  if (!storageAvailable()) return;
  try {
    await chrome.storage.local.set({
      [ONBOARDING_PENDING_KEY]: false,
      [ONBOARDING_COMPLETED_AT_KEY]: Date.now(),
    });
  } catch (err) {
    console.error("completeOnboarding failed", err);
  }
}
