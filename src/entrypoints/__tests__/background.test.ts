/**
 * Background service worker — first-install onboarding branch.
 *
 * Two workarounds are wrapped up in this file's location and shape:
 *
 * 1. WXT's `defineBackground` is a build-time global that vitest
 *    cannot evaluate (it lives inside the WXT bundler), so we cannot
 *    boot the `background.ts` entrypoint under the test runner.
 *    Instead we exercise the `handleInstalledEvent` helper that the
 *    entrypoint's `chrome.runtime.onInstalled` listener forwards to —
 *    the entrypoint itself only wires one line into it. See the
 *    comment at the top of `src/core/onboarding/state.ts` for the
 *    full rationale.
 *
 * 2. WXT's entrypoint scanner treats every `.ts` file directly under
 *    `src/entrypoints/` as an entrypoint, so `background.test.ts`
 *    beside `background.ts` fails the build with a duplicate-name
 *    error. Nesting the test inside `__tests__/` sidesteps the scan —
 *    the same pattern the overview test suite uses.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleInstalledEvent,
  ONBOARDING_INSTALLED_AT_KEY,
  ONBOARDING_PENDING_KEY,
} from "@/core/onboarding/state";

type StorageMap = Record<string, unknown>;

function installChromeStub(): { store: StorageMap; setSpy: ReturnType<typeof vi.fn> } {
  const store: StorageMap = {};
  const setSpy = vi.fn(async (patch: StorageMap) => {
    Object.assign(store, patch);
  });
  const g = globalThis as unknown as { chrome?: unknown };
  g.chrome = {
    storage: {
      local: {
        get: async (keys: string | string[]) => {
          const list = Array.isArray(keys) ? keys : [keys];
          const out: StorageMap = {};
          for (const k of list) if (k in store) out[k] = store[k];
          return out;
        },
        set: setSpy,
      },
    },
  };
  return { store, setSpy };
}

afterEach(() => {
  const g = globalThis as unknown as { chrome?: unknown };
  g.chrome = undefined;
  vi.restoreAllMocks();
});

describe("handleInstalledEvent (background onboarding branch)", () => {
  let stub: { store: StorageMap; setSpy: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    stub = installChromeStub();
  });

  it("sets onboardingPending=true and installedAt on a fresh install", async () => {
    const before = Date.now();
    await handleInstalledEvent({ reason: "install" });
    const after = Date.now();

    expect(stub.setSpy).toHaveBeenCalledTimes(1);
    expect(stub.store[ONBOARDING_PENDING_KEY]).toBe(true);
    const installedAt = stub.store[ONBOARDING_INSTALLED_AT_KEY];
    expect(typeof installedAt).toBe("number");
    expect(installedAt as number).toBeGreaterThanOrEqual(before);
    expect(installedAt as number).toBeLessThanOrEqual(after);
  });

  it("does NOT set onboardingPending on an update", async () => {
    await handleInstalledEvent({ reason: "update", previousVersion: "0.9" });
    expect(stub.setSpy).not.toHaveBeenCalled();
    expect(stub.store[ONBOARDING_PENDING_KEY]).toBeUndefined();
    expect(stub.store[ONBOARDING_INSTALLED_AT_KEY]).toBeUndefined();
  });

  it("does NOT set onboardingPending on a chrome_update", async () => {
    await handleInstalledEvent({ reason: "chrome_update" });
    expect(stub.setSpy).not.toHaveBeenCalled();
  });

  it("does NOT set onboardingPending on a shared_module_update", async () => {
    await handleInstalledEvent({ reason: "shared_module_update" });
    expect(stub.setSpy).not.toHaveBeenCalled();
  });

  it("no-ops silently when chrome.storage is unavailable", async () => {
    const g = globalThis as unknown as { chrome?: unknown };
    g.chrome = undefined;
    await expect(handleInstalledEvent({ reason: "install" })).resolves.toBeUndefined();
  });
});
