// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PageSnapshot, Settings } from "../../shared/types";
import { DEFAULT_SETTINGS } from "../../shared/types";
import { getDB, resetDBForTests } from "../storage/db";
import { countPageSnapshots, getPageSnapshot } from "../storage/pageSnapshots";
import {
  capturePageSnapshot,
  extractArticleText,
  maybeCaptureSnapshotFromSettings,
  PAGE_SNAPSHOT_MAX_BYTES,
  truncateOnCodepointBoundary,
} from "./pageSnapshot";

beforeEach(async () => {
  await getDB().pageSnapshots.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  resetDBForTests();
});

describe("extractArticleText", () => {
  it("prefers <main> over <body>", () => {
    const html = `<html><body>
      <header>Site chrome</header>
      <main><p>Keep this.</p></main>
      <footer>Copyright</footer>
    </body></html>`;
    expect(extractArticleText(html)).toBe("Keep this.");
  });

  it("falls back to <article> when no <main>", () => {
    const html = `<html><body>
      <article><p>Article body.</p></article>
      <nav>skip me</nav>
    </body></html>`;
    expect(extractArticleText(html)).toBe("Article body.");
  });

  it("falls back to <body> when neither <main> nor <article>", () => {
    const html = `<html><body>
      <nav>nav</nav>
      <div>plain div copy</div>
      <footer>foot</footer>
    </body></html>`;
    expect(extractArticleText(html)).toBe("plain div copy");
  });

  it("strips script and style bodies before extracting", () => {
    const html = `<html><body>
      <script>should('not appear');</script>
      <style>.x { color: red; }</style>
      <p>Real body.</p>
    </body></html>`;
    expect(extractArticleText(html)).toBe("Real body.");
  });

  it("strips iframe, form, svg, canvas, and template chrome", () => {
    const html = `<html><body>
      <iframe>frame text</iframe>
      <form>form fields</form>
      <svg>svg text</svg>
      <canvas>canvas fallback</canvas>
      <template>template body</template>
      <p>Keeper.</p>
    </body></html>`;
    expect(extractArticleText(html)).toBe("Keeper.");
  });

  it("collapses whitespace runs", () => {
    const html = `<html><body><main>
      one     two\n\n\nthree\tfour
    </main></body></html>`;
    expect(extractArticleText(html)).toBe("one two three four");
  });

  it("returns empty string on malformed input", () => {
    expect(extractArticleText("")).toBe("");
  });
});

describe("truncateOnCodepointBoundary", () => {
  it("returns the full string when under cap", () => {
    expect(truncateOnCodepointBoundary("hello", 1000)).toBe("hello");
  });

  it("truncates at exact ASCII byte cap", () => {
    expect(truncateOnCodepointBoundary("abcdef", 3)).toBe("abc");
  });

  it("does not split a surrogate pair (emoji is 4 bytes UTF-8)", () => {
    // "a" (1B) + "🙂" (4B) = 5B total. Cap at 3 must yield "a", not
    // "a" plus half of the emoji.
    const out = truncateOnCodepointBoundary("a🙂b", 3);
    expect(out).toBe("a");
  });

  it("keeps a multi-byte codepoint that fits fully within the cap", () => {
    // "🙂" is 4 bytes; cap of 4 keeps exactly one emoji.
    expect(truncateOnCodepointBoundary("🙂🙂", 4)).toBe("🙂");
  });

  it("handles cap 0 by returning empty", () => {
    expect(truncateOnCodepointBoundary("anything", 0)).toBe("");
  });
});

describe("capturePageSnapshot", () => {
  it("writes an extracted snapshot to the pageSnapshots table", async () => {
    const html = "<html><body><main><p>Snapshot body one.</p></main></body></html>";
    const result = await capturePageSnapshot({
      bookmarkId: "bk-1",
      html,
      now: 1_700_000_000_000,
    });
    expect(result.captured).toBe(true);
    expect(result.truncated).toBe(false);
    const row = await getPageSnapshot("bk-1");
    expect(row?.text).toBe("Snapshot body one.");
    expect(row?.capturedAt).toBe(1_700_000_000_000);
    expect(row?.byteLength).toBe(new TextEncoder().encode("Snapshot body one.").byteLength);
    expect(await countPageSnapshots()).toBe(1);
  });

  it("replaces the existing snapshot on a second capture (same bookmarkId)", async () => {
    await capturePageSnapshot({
      bookmarkId: "bk-2",
      html: "<html><body><main><p>First.</p></main></body></html>",
      now: 1,
    });
    await capturePageSnapshot({
      bookmarkId: "bk-2",
      html: "<html><body><main><p>Second.</p></main></body></html>",
      now: 2,
    });
    const row = await getPageSnapshot("bk-2");
    expect(row?.text).toBe("Second.");
    expect(row?.capturedAt).toBe(2);
    expect(await countPageSnapshots()).toBe(1);
  });

  it("truncates and logs when the extracted text exceeds the cap", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const bigText = "x".repeat(600 * 1024); // 600 KB, above 500 KB cap
    const html = `<html><body><main><p>${bigText}</p></main></body></html>`;
    const result = await capturePageSnapshot({
      bookmarkId: "bk-3",
      html,
      now: 1,
    });
    expect(result.captured).toBe(true);
    expect(result.truncated).toBe(true);
    expect(result.byteLength).toBe(600 * 1024);
    expect(result.storedByteLength).toBeLessThanOrEqual(PAGE_SNAPSHOT_MAX_BYTES);
    const row = await getPageSnapshot("bk-3");
    expect(row?.byteLength).toBe(600 * 1024);
    expect(row?.text.length).toBeLessThan(bigText.length);
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/pageSnapshot: truncated/));
  });

  it("skips the write when extraction yields empty text", async () => {
    const result = await capturePageSnapshot({
      bookmarkId: "bk-4",
      html: "<html><body><script>only()</script></body></html>",
      now: 1,
    });
    expect(result.captured).toBe(false);
    expect(result.reason).toBe("empty");
    expect(await countPageSnapshots()).toBe(0);
  });

  it("honors an injected sink for hermetic tests", async () => {
    const captured: PageSnapshot[] = [];
    const result = await capturePageSnapshot({
      bookmarkId: "bk-5",
      html: "<html><body><main>Injected sink.</main></body></html>",
      now: 42,
      sink: async (s) => {
        captured.push(s);
      },
    });
    expect(result.captured).toBe(true);
    expect(captured).toHaveLength(1);
    expect(captured[0].bookmarkId).toBe("bk-5");
    expect(captured[0].text).toBe("Injected sink.");
    expect(await countPageSnapshots()).toBe(0);
  });
});

describe("maybeCaptureSnapshotFromSettings", () => {
  const html = "<html><body><main>Gate body.</main></body></html>";

  function settingsWith(patch: Partial<Settings>): Settings {
    return { ...DEFAULT_SETTINGS, ...patch };
  }

  it("no-ops when networkEnrichmentEnabled is off", async () => {
    const result = await maybeCaptureSnapshotFromSettings({
      bookmarkId: "gate-1",
      html,
      settingsReader: async () =>
        settingsWith({ networkEnrichmentEnabled: false, pageSnapshotEnabled: true }),
    });
    expect(result).toBeNull();
    expect(await countPageSnapshots()).toBe(0);
  });

  it("no-ops when pageSnapshotEnabled is off", async () => {
    const result = await maybeCaptureSnapshotFromSettings({
      bookmarkId: "gate-2",
      html,
      settingsReader: async () =>
        settingsWith({ networkEnrichmentEnabled: true, pageSnapshotEnabled: false }),
    });
    expect(result).toBeNull();
    expect(await countPageSnapshots()).toBe(0);
  });

  it("captures when both toggles are on", async () => {
    const result = await maybeCaptureSnapshotFromSettings({
      bookmarkId: "gate-3",
      html,
      now: 99,
      settingsReader: async () =>
        settingsWith({ networkEnrichmentEnabled: true, pageSnapshotEnabled: true }),
    });
    expect(result?.captured).toBe(true);
    const row = await getPageSnapshot("gate-3");
    expect(row?.text).toBe("Gate body.");
    expect(row?.capturedAt).toBe(99);
  });
});
