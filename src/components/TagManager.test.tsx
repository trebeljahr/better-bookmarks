// @vitest-environment happy-dom

/**
 * TagManager component tests.
 *
 * Covers the acceptance criteria for the tag rename/merge/delete UI:
 *  - Every tag renders with its bookmark count.
 *  - The sort helper produces the expected order for alphabetical and
 *    count-based modes in both directions.
 *  - A sort control is exposed and reachable by accessible name.
 *  - Rename is inline: Enter commits, Escape cancels.
 *  - Merge shows a confirm dialog naming source, destination and
 *    affected count BEFORE calling onMerge; cancelling leaves onMerge
 *    untouched.
 *  - Delete shows a confirm dialog stating how many bookmarks currently
 *    carry the tag; cancelling leaves onDelete untouched.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Tag } from "@/shared/types";

const { render, cleanup, screen, fireEvent, within } = await import("@testing-library/react");
const { TagManager, sortTags } = await import("@/components/TagManager");

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function makeTag(name: string, extras: Partial<Tag> = {}): Tag {
  return {
    name,
    lowercaseName: name.toLowerCase(),
    parentName: null,
    color: null,
    description: "",
    mirrorFolderId: null,
    createdAt: 0,
    ...extras,
  };
}

const SAMPLE_TAGS: Tag[] = [makeTag("alpha"), makeTag("beta"), makeTag("gamma")];
const SAMPLE_COUNTS: Record<string, number> = {
  alpha: 3,
  beta: 12,
  gamma: 7,
};

type Handlers = {
  onRename: ReturnType<typeof vi.fn>;
  onMerge: ReturnType<typeof vi.fn>;
  onDelete: ReturnType<typeof vi.fn>;
  onSetColor: ReturnType<typeof vi.fn>;
  onSetParent: ReturnType<typeof vi.fn>;
  onClose: ReturnType<typeof vi.fn>;
};

function buildHandlers(overrides: Partial<Handlers> = {}): Handlers {
  return {
    onRename: vi.fn(async () => {}),
    onMerge: vi.fn(async () => ({ affected: 12 })),
    onDelete: vi.fn(async () => {}),
    onSetColor: vi.fn(async () => {}),
    onSetParent: vi.fn(async () => {}),
    onClose: vi.fn(),
    ...overrides,
  };
}

function renderManager(
  overrides: { tags?: Tag[]; counts?: Record<string, number>; handlers?: Partial<Handlers> } = {},
) {
  const handlers = buildHandlers(overrides.handlers);
  const utils = render(
    <TagManager
      tags={overrides.tags ?? SAMPLE_TAGS}
      counts={overrides.counts ?? SAMPLE_COUNTS}
      onRename={handlers.onRename}
      onMerge={handlers.onMerge}
      onDelete={handlers.onDelete}
      onSetColor={handlers.onSetColor}
      onSetParent={handlers.onSetParent}
      onClose={handlers.onClose}
    />,
  );
  return { ...utils, handlers };
}

/** Read the tag rows in visual order using their name badge. */
function rowFor(name: string): HTMLElement {
  const badges = screen.getAllByText(name);
  const row = badges[0].closest("[class*='rounded-md']") as HTMLElement | null;
  if (!row) throw new Error(`row for tag "${name}" not found`);
  return row;
}

/**
 * Simulate a click on a Radix popover trigger, which listens on
 * pointerdown rather than the synthetic click alone.
 */
function openPopover(trigger: HTMLElement): void {
  fireEvent.pointerDown(trigger, { button: 0 });
  fireEvent.click(trigger);
}

describe("sortTags", () => {
  const tags = [makeTag("cat"), makeTag("apple"), makeTag("banana")];
  const counts: Record<string, number> = { cat: 5, apple: 5, banana: 1 };

  it("sorts by name ascending", () => {
    expect(sortTags(tags, counts, "name-asc").map((t) => t.name)).toEqual([
      "apple",
      "banana",
      "cat",
    ]);
  });

  it("sorts by name descending", () => {
    expect(sortTags(tags, counts, "name-desc").map((t) => t.name)).toEqual([
      "cat",
      "banana",
      "apple",
    ]);
  });

  it("sorts by count descending, breaking ties alphabetically", () => {
    expect(sortTags(tags, counts, "count-desc").map((t) => t.name)).toEqual([
      "apple",
      "cat",
      "banana",
    ]);
  });

  it("sorts by count ascending, breaking ties alphabetically", () => {
    expect(sortTags(tags, counts, "count-asc").map((t) => t.name)).toEqual([
      "banana",
      "apple",
      "cat",
    ]);
  });

  it("treats missing counts as zero", () => {
    const orphaned = [makeTag("one"), makeTag("two")];
    expect(sortTags(orphaned, {}, "count-desc").map((t) => t.name)).toEqual(["one", "two"]);
  });

  it("does not mutate the input array", () => {
    const original = tags.slice();
    sortTags(tags, counts, "name-desc");
    expect(tags).toEqual(original);
  });
});

describe("TagManager", () => {
  it("lists every tag with its bookmark count", () => {
    renderManager();
    expect(screen.getByText("Tags (3)")).toBeTruthy();
    expect(screen.getByText("alpha")).toBeTruthy();
    expect(screen.getByText("beta")).toBeTruthy();
    expect(screen.getByText("gamma")).toBeTruthy();
    expect(screen.getByText("3 bookmarks")).toBeTruthy();
    expect(screen.getByText("12 bookmarks")).toBeTruthy();
    expect(screen.getByText("7 bookmarks")).toBeTruthy();
  });

  it("exposes an accessible sort control", () => {
    renderManager();
    const trigger = screen.getByRole("combobox", { name: /Sort tags/i });
    expect(trigger).toBeTruthy();
    // The default sort is name-asc, so the trigger label reads
    // "Name A → Z".
    expect(trigger.textContent).toContain("Name A");
  });

  it("rename commits on Enter", async () => {
    const { handlers } = renderManager();
    const row = rowFor("alpha");
    fireEvent.click(within(row).getByLabelText("rename"));
    const inputs = row.querySelectorAll("input");
    const input = inputs[inputs.length - 1] as HTMLInputElement;
    fireEvent.change(input, { target: { value: "alpha-renamed" } });
    fireEvent.keyDown(input, { key: "Enter" });
    // The rename handler runs on a microtask; flush it.
    await Promise.resolve();
    expect(handlers.onRename).toHaveBeenCalledWith("alpha", "alpha-renamed");
  });

  it("rename cancels on Escape without calling onRename", () => {
    const { handlers } = renderManager();
    const row = rowFor("alpha");
    fireEvent.click(within(row).getByLabelText("rename"));
    const inputs = row.querySelectorAll("input");
    const input = inputs[inputs.length - 1] as HTMLInputElement;
    fireEvent.change(input, { target: { value: "should-not-save" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(handlers.onRename).not.toHaveBeenCalled();
    expect(row.querySelectorAll("input").length).toBe(0);
  });

  it("merge shows a confirm dialog quoting source, destination and count", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { handlers } = renderManager();
    const row = rowFor("beta");
    fireEvent.click(within(row).getByLabelText("merge into"));
    const popoverTrigger = within(row).getByText(/Merge "beta"/);
    openPopover(popoverTrigger);
    const commandInput = document.querySelector(
      "input[placeholder='Type tag name…']",
    ) as HTMLInputElement | null;
    if (!commandInput) throw new Error("merge picker input not found");
    fireEvent.change(commandInput, { target: { value: "gamma" } });
    // Approve button — the icon-only default button carrying the check
    // icon. It's the first icon-only button in the merge sub-row
    // (rendered after the popover trigger).
    const approveButton = within(row)
      .getAllByRole("button")
      .find((b) => !b.getAttribute("aria-label") && b.textContent === "");
    if (!approveButton) throw new Error("merge approve button not found");
    fireEvent.click(approveButton);
    await Promise.resolve();
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    const message = confirmSpy.mock.calls[0][0] as string;
    expect(message).toContain('re-tagged from "beta" to "gamma"');
    expect(message).toContain("12");
    expect(handlers.onMerge).toHaveBeenCalledWith("beta", "gamma");
  });

  it("cancelling the merge confirm dialog does not call onMerge", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { handlers } = renderManager();
    const row = rowFor("beta");
    fireEvent.click(within(row).getByLabelText("merge into"));
    const popoverTrigger = within(row).getByText(/Merge "beta"/);
    openPopover(popoverTrigger);
    const commandInput = document.querySelector(
      "input[placeholder='Type tag name…']",
    ) as HTMLInputElement | null;
    if (!commandInput) throw new Error("merge picker input not found");
    fireEvent.change(commandInput, { target: { value: "gamma" } });
    const approveButton = within(row)
      .getAllByRole("button")
      .find((b) => !b.getAttribute("aria-label") && b.textContent === "");
    if (!approveButton) throw new Error("merge approve button not found");
    fireEvent.click(approveButton);
    await Promise.resolve();
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(handlers.onMerge).not.toHaveBeenCalled();
  });

  it("delete asks for confirmation naming the affected count", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { handlers } = renderManager();
    const row = rowFor("gamma");
    fireEvent.click(within(row).getByLabelText("delete"));
    await Promise.resolve();
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    const message = confirmSpy.mock.calls[0][0] as string;
    expect(message).toContain("7 bookmarks");
    expect(message).toContain("delete anyway");
    expect(handlers.onDelete).toHaveBeenCalledWith("gamma");
  });

  it("cancelling the delete confirm dialog leaves the tag alone", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { handlers } = renderManager();
    const row = rowFor("alpha");
    fireEvent.click(within(row).getByLabelText("delete"));
    await Promise.resolve();
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(handlers.onDelete).not.toHaveBeenCalled();
  });

  it("delete of a tag on zero bookmarks reports 0 in the confirm", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderManager({
      tags: [makeTag("orphan")],
      counts: {},
    });
    fireEvent.click(screen.getByLabelText("delete"));
    await Promise.resolve();
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toContain("0 bookmarks");
  });
});
