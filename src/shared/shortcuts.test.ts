// @vitest-environment happy-dom

/**
 * Shortcut-list invariants and `?`-detection semantics.
 *
 * The `SHORTCUT_GROUPS` array is a source of truth for the help overlay —
 * these tests catch shape regressions (a shortcut with no keys, an unknown
 * surface) so a bad addition fails CI instead of shipping to the overlay
 * as an empty row.
 */

import { describe, expect, it } from "vitest";
import {
  ALL_SHORTCUTS,
  isHelpShortcut,
  isTypingTarget,
  SHORTCUT_GROUPS,
  type ShortcutSurface,
} from "@/shared/shortcuts";

const KNOWN_SURFACES: ReadonlySet<ShortcutSurface> = new Set([
  "overview",
  "sidepanel",
  "detail",
  "everywhere",
]);

describe("SHORTCUT_GROUPS", () => {
  it("has at least one group", () => {
    expect(SHORTCUT_GROUPS.length).toBeGreaterThan(0);
  });

  it("every group has a title and at least one shortcut", () => {
    for (const g of SHORTCUT_GROUPS) {
      expect(g.title).toMatch(/\S/);
      expect(g.shortcuts.length).toBeGreaterThan(0);
    }
  });

  it("every shortcut has non-empty keys, description, and a known surface", () => {
    for (const s of ALL_SHORTCUTS) {
      expect(s.keys.length).toBeGreaterThan(0);
      for (const k of s.keys) expect(k).toMatch(/\S/);
      expect(s.description).toMatch(/\S/);
      expect(KNOWN_SURFACES.has(s.surface)).toBe(true);
    }
  });

  it("advertises the two browser commands declared in wxt.config.ts", () => {
    const combos = ALL_SHORTCUTS.filter((s) => s.browserCommand).flatMap((s) => s.keys);
    expect(combos).toContain("Ctrl+Shift+X");
    expect(combos).toContain("Ctrl+Shift+B");
  });

  it("advertises the `?` help shortcut", () => {
    const combos = ALL_SHORTCUTS.flatMap((s) => s.keys);
    expect(combos).toContain("?");
  });
});

describe("isTypingTarget", () => {
  it("returns true for INPUT / TEXTAREA / SELECT and contenteditable", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const select = document.createElement("select");
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(textarea)).toBe(true);
    expect(isTypingTarget(select)).toBe(true);
    expect(isTypingTarget(editable)).toBe(true);
  });

  it("returns false for a plain div or a null target", () => {
    expect(isTypingTarget(document.createElement("div"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("isHelpShortcut", () => {
  function keyEvent(init: Partial<KeyboardEventInit> & { target?: EventTarget | null } = {}) {
    const ev = new KeyboardEvent("keydown", { key: init.key, shiftKey: init.shiftKey });
    if (init.target !== undefined) {
      Object.defineProperty(ev, "target", { value: init.target });
    }
    return ev;
  }

  it("matches bare `?`", () => {
    expect(isHelpShortcut(keyEvent({ key: "?" }))).toBe(true);
  });

  it("matches Shift+/ (the physical combo that produces `?` on many layouts)", () => {
    expect(isHelpShortcut(keyEvent({ key: "/", shiftKey: true }))).toBe(true);
  });

  it("ignores `?` while the user is typing in an input", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    try {
      expect(isHelpShortcut(keyEvent({ key: "?", target: input }))).toBe(false);
    } finally {
      input.remove();
    }
  });

  it("does not match `/` without shift (that's focus-search)", () => {
    expect(isHelpShortcut(keyEvent({ key: "/" }))).toBe(false);
  });
});
