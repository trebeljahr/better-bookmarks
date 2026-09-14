/**
 * Verifies the consent gate for the semantic-embed offscreen document.
 *
 * The bug this test locks in: on first install / first SW boot the
 * background used to call `ensureOffscreen()` unconditionally, which
 * warmed up the transformers.js pipeline and downloaded ~33 MB of
 * model files from huggingface.co before the user had ever opted in.
 * `ensureOffscreenIfEnabled` reads `settings.semanticSearchEnabled`
 * and refuses to touch `chrome.offscreen` when the flag is off.
 *
 * See docs/PRIVACY.md §3 and GH #2.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, type Settings } from "@/shared/types";

type ChromeStub = {
  storage: {
    local: {
      get: ReturnType<typeof vi.fn>;
      set: ReturnType<typeof vi.fn>;
    };
  };
  offscreen: {
    hasDocument: ReturnType<typeof vi.fn>;
    createDocument: ReturnType<typeof vi.fn>;
  };
  runtime: {
    getURL: (p: string) => string;
    sendMessage: ReturnType<typeof vi.fn>;
    onMessage: { addListener: () => void; removeListener: () => void };
  };
};

const SETTINGS_KEY = "__bb_settings__";

function installChrome(overrides: Partial<Settings> = {}): ChromeStub {
  const stored: Settings = { ...DEFAULT_SETTINGS, ...overrides };
  const stub: ChromeStub = {
    storage: {
      local: {
        get: vi.fn(async (_key: string) => ({ [SETTINGS_KEY]: stored })),
        set: vi.fn(async (_v: unknown) => undefined),
      },
    },
    offscreen: {
      hasDocument: vi.fn(async () => false),
      createDocument: vi.fn(async () => undefined),
    },
    runtime: {
      getURL: (p: string) => `chrome-extension://test/${p}`,
      sendMessage: vi.fn(async () => ({ ok: true })),
      onMessage: { addListener: () => {}, removeListener: () => {} },
    },
  };
  (globalThis as unknown as { chrome: ChromeStub }).chrome = stub;
  return stub;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.resetModules();
  delete (globalThis as unknown as { chrome?: unknown }).chrome;
});

describe("ensureOffscreenIfEnabled — first-boot consent gate", () => {
  it("does NOT create the offscreen document when semanticSearchEnabled is false (default)", async () => {
    const stub = installChrome({ semanticSearchEnabled: false });
    const { ensureOffscreenIfEnabled } = await import("./bridge");

    const created = await ensureOffscreenIfEnabled();

    expect(created).toBe(false);
    expect(stub.offscreen.hasDocument).not.toHaveBeenCalled();
    expect(stub.offscreen.createDocument).not.toHaveBeenCalled();
  });

  it("creates the offscreen document when semanticSearchEnabled is true", async () => {
    const stub = installChrome({ semanticSearchEnabled: true });
    const { ensureOffscreenIfEnabled } = await import("./bridge");

    const created = await ensureOffscreenIfEnabled();

    expect(created).toBe(true);
    expect(stub.offscreen.hasDocument).toHaveBeenCalledTimes(1);
    expect(stub.offscreen.createDocument).toHaveBeenCalledTimes(1);
    const arg = stub.offscreen.createDocument.mock.calls[0]?.[0] as {
      url: string;
      reasons: string[];
    };
    expect(arg?.url).toBe("offscreen.html");
    expect(arg?.reasons).toContain("WORKERS");
  });

  it("is idempotent — a second call skips createDocument when one already exists", async () => {
    const stub = installChrome({ semanticSearchEnabled: true });
    stub.offscreen.hasDocument.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const { ensureOffscreenIfEnabled } = await import("./bridge");

    await ensureOffscreenIfEnabled();
    await ensureOffscreenIfEnabled();

    expect(stub.offscreen.createDocument).toHaveBeenCalledTimes(1);
  });
});

describe("DEFAULT_SETTINGS — semantic search opt-in defaults", () => {
  it("semanticSearchEnabled defaults to false", () => {
    expect(DEFAULT_SETTINGS.semanticSearchEnabled).toBe(false);
  });

  it("semanticSearchBannerDismissedAt defaults to 0 (never dismissed)", () => {
    expect(DEFAULT_SETTINGS.semanticSearchBannerDismissedAt).toBe(0);
  });
});

describe("ensureOffscreenIfEnabled — after opt-in flip", () => {
  it("flipping semanticSearchEnabled from false to true starts the offscreen doc on the next call", async () => {
    // Start disabled — no doc created.
    const stub = installChrome({ semanticSearchEnabled: false });
    const bridge = await import("./bridge");
    expect(await bridge.ensureOffscreenIfEnabled()).toBe(false);
    expect(stub.offscreen.createDocument).not.toHaveBeenCalled();

    // Simulate a settings write flipping the flag on. The next gate
    // call should see the new value and create the doc.
    stub.storage.local.get.mockImplementation(async () => ({
      [SETTINGS_KEY]: { ...DEFAULT_SETTINGS, semanticSearchEnabled: true },
    }));
    expect(await bridge.ensureOffscreenIfEnabled()).toBe(true);
    expect(stub.offscreen.createDocument).toHaveBeenCalledTimes(1);
  });
});
