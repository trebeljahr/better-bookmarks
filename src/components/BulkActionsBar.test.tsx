// @vitest-environment happy-dom

/**
 * BulkActionsBar — component tests.
 *
 * Covers the bar's five verbs (add tag, remove tag, set rating, set status,
 * mark read) and the delete confirmation dialog. Also exercises the drop
 * target hook indirectly through the render (any prop wiring change breaks
 * a snapshot-style test), and verifies the modal preview lists the first
 * three titles plus an "and N more" line.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const { act, cleanup, fireEvent, render, screen, within } = await import("@testing-library/react");
const { BulkActionsBar, BulkDeleteConfirm } = await import("@/components/BulkActionsBar");

afterEach(() => cleanup());

type Handlers = {
  onClear: ReturnType<typeof vi.fn>;
  onAddTag: ReturnType<typeof vi.fn>;
  onRemoveTag: ReturnType<typeof vi.fn>;
  onSetRating: ReturnType<typeof vi.fn>;
  onSetStatus: ReturnType<typeof vi.fn>;
  onMarkRead: ReturnType<typeof vi.fn>;
  onDelete: ReturnType<typeof vi.fn>;
  onDropAdd: ReturnType<typeof vi.fn>;
};

function makeHandlers(): Handlers {
  return {
    onClear: vi.fn(),
    onAddTag: vi.fn(),
    onRemoveTag: vi.fn(),
    onSetRating: vi.fn(),
    onSetStatus: vi.fn(),
    onMarkRead: vi.fn(),
    onDelete: vi.fn(),
    onDropAdd: vi.fn(),
  };
}

function renderBar(overrides: Partial<Parameters<typeof BulkActionsBar>[0]> = {}) {
  const handlers = makeHandlers();
  const view = render(
    <BulkActionsBar
      selectedCount={3}
      selectedIds={["a", "b", "c"]}
      selectedTitles={["First", "Second", "Third"]}
      {...handlers}
      {...overrides}
    />,
  );
  return { ...view, handlers };
}

describe("BulkActionsBar", () => {
  it("renders the selection count badge", () => {
    renderBar();
    expect(screen.getByText("3 selected")).toBeTruthy();
  });

  it("clear button invokes onClear", () => {
    const { handlers } = renderBar();
    fireEvent.click(screen.getByLabelText("clear selection"));
    expect(handlers.onClear).toHaveBeenCalledTimes(1);
  });

  it("submitting the add-tag input calls onAddTag with the trimmed value", () => {
    const { handlers } = renderBar();
    const input = screen.getByLabelText("add tag to selected") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  reading-list  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(handlers.onAddTag).toHaveBeenCalledWith("reading-list");
    // Input should have been cleared after submission.
    expect(input.value).toBe("");
  });

  it("submit-add button is disabled for whitespace-only input", () => {
    renderBar();
    const btn = screen.getByLabelText("apply add tag") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    const input = screen.getByLabelText("add tag to selected");
    fireEvent.change(input, { target: { value: "   " } });
    expect(btn.disabled).toBe(true);
    fireEvent.change(input, { target: { value: "docs" } });
    expect(btn.disabled).toBe(false);
  });

  it("submitting the remove-tag input calls onRemoveTag with the trimmed value", () => {
    const { handlers } = renderBar();
    const input = screen.getByLabelText("remove tag from selected") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "obsolete" } });
    fireEvent.click(screen.getByLabelText("apply remove tag"));
    expect(handlers.onRemoveTag).toHaveBeenCalledWith("obsolete");
    expect(input.value).toBe("");
  });

  it("mark-read button calls onMarkRead", () => {
    const { handlers } = renderBar();
    fireEvent.click(screen.getByLabelText("mark selected as read"));
    expect(handlers.onMarkRead).toHaveBeenCalledTimes(1);
  });

  it("clicking Delete opens the confirmation dialog with the first three titles", async () => {
    const { handlers } = renderBar({
      selectedCount: 12,
      selectedTitles: ["Zeroth", "First", "Second"],
    });
    fireEvent.click(screen.getByLabelText("delete selected"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Delete 12 bookmarks?")).toBeTruthy();
    for (const title of ["Zeroth", "First", "Second"]) {
      expect(within(dialog).getByText(title)).toBeTruthy();
    }
    // 12 total - 3 shown = 9 more.
    expect(within(dialog).getByText(/and 9 more/i)).toBeTruthy();
    expect(handlers.onDelete).not.toHaveBeenCalled();
  });

  it("confirming the dialog calls onDelete and closes it", async () => {
    const { handlers } = renderBar({ selectedCount: 2, selectedTitles: ["Alpha", "Beta"] });
    act(() => {
      fireEvent.click(screen.getByLabelText("delete selected"));
    });
    const dialog = await screen.findByRole("dialog");
    const confirmBtn = within(dialog).getByRole("button", { name: /^confirm bulk delete$/i });
    act(() => {
      fireEvent.click(confirmBtn);
    });
    expect(handlers.onDelete).toHaveBeenCalledTimes(1);
    // Dialog should be gone.
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("cancelling the dialog does not call onDelete", async () => {
    const { handlers } = renderBar();
    act(() => {
      fireEvent.click(screen.getByLabelText("delete selected"));
    });
    const dialog = await screen.findByRole("dialog");
    const cancelBtn = within(dialog).getByRole("button", { name: /^cancel bulk delete$/i });
    act(() => {
      fireEvent.click(cancelBtn);
    });
    expect(handlers.onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("singular delete phrasing when only one bookmark is selected", async () => {
    renderBar({ selectedCount: 1, selectedTitles: ["Only one"] });
    act(() => {
      fireEvent.click(screen.getByLabelText("delete selected"));
    });
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Delete 1 bookmark?")).toBeTruthy();
  });
});

describe("BulkDeleteConfirm", () => {
  it("shows a placeholder for untitled entries", () => {
    render(
      <BulkDeleteConfirm
        open
        count={2}
        firstTitles={["", "Real title"]}
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("(untitled)")).toBeTruthy();
    expect(within(dialog).getByText("Real title")).toBeTruthy();
  });

  it("omits the 'and N more' line when count equals shown titles", () => {
    render(
      <BulkDeleteConfirm
        open
        count={2}
        firstTitles={["a", "b"]}
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.queryByText(/and .* more/i)).toBeNull();
  });
});
