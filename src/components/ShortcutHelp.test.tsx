// @vitest-environment happy-dom

/**
 * ShortcutHelp overlay — renders every source-of-truth shortcut.
 *
 * The overlay's job is to stay in sync with `SHORTCUT_GROUPS`. This
 * test asserts that: (a) every group title appears in the DOM, and
 * (b) every shortcut description appears in the DOM. That way a new
 * shortcut added to the array can't accidentally be missed by the
 * overlay.
 */

import { afterEach, describe, expect, it } from "vitest";
import { ALL_SHORTCUTS, SHORTCUT_GROUPS } from "@/shared/shortcuts";

const { render, cleanup, screen } = await import("@testing-library/react");
const { ShortcutHelp } = await import("@/components/ShortcutHelp");

afterEach(() => cleanup());

describe("ShortcutHelp", () => {
  it("renders nothing when closed", () => {
    render(<ShortcutHelp open={false} onOpenChange={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the dialog title when open", () => {
    render(<ShortcutHelp open={true} onOpenChange={() => {}} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Keyboard shortcuts")).toBeTruthy();
  });

  it("renders every group title", () => {
    render(<ShortcutHelp open={true} onOpenChange={() => {}} />);
    for (const g of SHORTCUT_GROUPS) {
      expect(screen.getAllByText(g.title).length).toBeGreaterThan(0);
    }
  });

  it("renders every shortcut description", () => {
    render(<ShortcutHelp open={true} onOpenChange={() => {}} />);
    for (const s of ALL_SHORTCUTS) {
      expect(screen.getAllByText(s.description).length).toBeGreaterThan(0);
    }
  });

  it("renders the Chrome badge on browser-command shortcuts", () => {
    render(<ShortcutHelp open={true} onOpenChange={() => {}} />);
    const browserCount = ALL_SHORTCUTS.filter((s) => s.browserCommand).length;
    expect(screen.getAllByText("Chrome").length).toBe(browserCount);
  });
});
