/**
 * Shared setup for automated accessibility (axe) tests.
 *
 * Each __tests__/a11y.test.tsx suite runs under happy-dom (per-file
 * `@vitest-environment happy-dom` pragma) and imports this file to:
 *
 * 1. Register the `toHaveNoViolations` matcher from vitest-axe.
 * 2. Install a stub `chrome` global so modules that lazily poke at
 *    chrome.* (settings, tabs, alarms) don't throw on import.
 * 3. Provide an `axe` helper that always disables the `color-contrast`
 *    rule — computed CSS colors are unreliable in headless DOMs like
 *    happy-dom / jsdom, and color-contrast belongs on a visual pass
 *    rather than a CI unit run.
 * 4. Provide `filterAxeResults` that keeps only serious/critical
 *    violations. Policy: CI fails only on serious/critical (see
 *    docs/ACCESSIBILITY.md).
 */

import type { AxeResults, Result, RunOptions } from "axe-core";
import { expect } from "vitest";
import { axe as rawAxe, toHaveNoViolations } from "vitest-axe";

expect.extend({ toHaveNoViolations });

/**
 * Install a permissive `chrome` global. Individual modules are already
 * defensive about `typeof chrome === "undefined"`, but stubbing the
 * shape prevents accidental TypeErrors when a module reaches into a
 * nested namespace during import-time initialisation.
 */
export function installChromeStub(): void {
  const g = globalThis as unknown as { chrome?: unknown };
  if (g.chrome !== undefined) return;
  const noopAsync = <T>(value: T) => Promise.resolve(value);
  g.chrome = {
    runtime: {
      getURL: (path: string) => `chrome-extension://test/${path}`,
      openOptionsPage: () => Promise.resolve(),
      sendMessage: () => Promise.resolve(),
      onMessage: { addListener: () => {}, removeListener: () => {} },
    },
    tabs: {
      query: () => noopAsync([] as unknown[]),
      create: () => noopAsync({}),
      update: () => noopAsync({}),
      getCurrent: () => noopAsync(null),
    },
    storage: {
      local: {
        get: () => noopAsync({}),
        set: () => noopAsync(undefined),
        remove: () => noopAsync(undefined),
      },
      sync: {
        get: () => noopAsync({}),
        set: () => noopAsync(undefined),
      },
      onChanged: { addListener: () => {}, removeListener: () => {} },
    },
    bookmarks: {
      getTree: () => noopAsync([]),
      onCreated: { addListener: () => {}, removeListener: () => {} },
      onRemoved: { addListener: () => {}, removeListener: () => {} },
      onChanged: { addListener: () => {}, removeListener: () => {} },
      onMoved: { addListener: () => {}, removeListener: () => {} },
    },
    alarms: {
      create: () => {},
      clear: () => noopAsync(true),
      onAlarm: { addListener: () => {}, removeListener: () => {} },
    },
    action: {
      setIcon: () => noopAsync(undefined),
      setBadgeText: () => noopAsync(undefined),
      setBadgeBackgroundColor: () => noopAsync(undefined),
    },
    downloads: {
      download: () => noopAsync(1),
      search: () => noopAsync([]),
      erase: () => noopAsync([]),
    },
    contextMenus: {
      create: () => {},
      remove: () => Promise.resolve(),
      removeAll: () => Promise.resolve(),
      onClicked: { addListener: () => {}, removeListener: () => {} },
    },
    sidePanel: {
      setPanelBehavior: () => noopAsync(undefined),
      open: () => noopAsync(undefined),
    },
    omnibox: {
      onInputChanged: { addListener: () => {} },
      onInputEntered: { addListener: () => {} },
      onInputStarted: { addListener: () => {} },
      onInputCancelled: { addListener: () => {} },
      setDefaultSuggestion: () => {},
    },
    offscreen: {
      createDocument: () => noopAsync(undefined),
      hasDocument: () => noopAsync(false),
      closeDocument: () => noopAsync(undefined),
    },
  };
}

const BASE_AXE_OPTIONS: RunOptions = {
  rules: {
    // color-contrast requires a real layout engine to compute
    // effective foreground/background. happy-dom returns empty
    // strings for most computed colors, so this rule reports
    // false positives (or crashes outright) in CI. Colour work
    // belongs on a manual visual pass, not CI.
    "color-contrast": { enabled: false },
  },
};

/**
 * Run axe against a DOM node with the project defaults applied.
 * Accepts an override options bag that is shallow-merged over
 * BASE_AXE_OPTIONS.
 */
export async function axe(node: Element | string, overrides: RunOptions = {}): Promise<AxeResults> {
  return rawAxe(node, { ...BASE_AXE_OPTIONS, ...overrides });
}

/**
 * The CI policy: fail only on serious/critical violations. Minor and
 * moderate findings are surfaced by `pnpm test -- --reporter=verbose`
 * locally but do not block a merge — they are tracked as follow-ups
 * in the accessibility doc.
 */
export function filterAxeResults(results: AxeResults): Result[] {
  return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
}
