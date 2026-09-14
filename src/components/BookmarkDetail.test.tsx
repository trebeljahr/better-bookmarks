// @vitest-environment happy-dom

/**
 * BookmarkDetail keyboard wiring.
 *
 * The drawer swallows Cmd/Ctrl+Enter as a "save now" chord so a user
 * editing the title or note can commit without reaching for the mouse.
 * This test dirties a field and asserts the chord calls `onSave` with
 * the mutated bookmark.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Bookmark } from "@/shared/types";

// The detail drawer imports edges hooks that reach IndexedDB — stub
// them so the render tree stays deterministic.
vi.mock("@/hooks/useEdges", () => ({
  useEdges: () => ({
    edges: [],
    suggestions: [],
    refresh: async () => {},
    loading: false,
  }),
}));

vi.mock("@/hooks/useBookmarkDnd", () => ({
  useBookmarkDragSource: () => ({}),
}));

vi.mock("@/core/edges/crud", () => ({
  createEdge: async () => "edge-id",
  deleteEdge: async () => {},
}));

const { render, cleanup, fireEvent, act } = await import("@testing-library/react");
const { BookmarkDetail } = await import("@/components/BookmarkDetail");

const FIXTURE: Bookmark = {
  id: "b1",
  originalUrl: "https://example.com/a",
  canonicalUrl: "https://example.com/a",
  domain: "example.com",
  title: "Original",
  description: "",
  note: "",
  rating: null,
  necessaryTime: null,
  status: "unread",
  contentType: "article",
  tags: [],
  createdAt: 1,
  updatedAt: 1,
  capturedFrom: "manual",
};

afterEach(() => cleanup());

describe("BookmarkDetail keyboard shortcuts", () => {
  it("Cmd+Enter saves the drawer once a field is dirty", async () => {
    const onSave = vi.fn(async () => {});
    const { getByLabelText } = render(
      <BookmarkDetail
        bookmark={FIXTURE}
        allBookmarks={[FIXTURE]}
        possibleTags={[]}
        onSave={onSave}
        onDelete={async () => {}}
        onClose={() => {}}
      />,
    );

    // Dirty the title so the save handler is enabled.
    const titleInput = getByLabelText(/^Title$/i) as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "Edited" } });

    await act(async () => {
      fireEvent.keyDown(document, { key: "Enter", metaKey: true });
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0] as Bookmark;
    expect(saved.title).toBe("Edited");
  });

  it("Ctrl+Enter also saves (non-mac chord)", async () => {
    const onSave = vi.fn(async () => {});
    const { getByLabelText } = render(
      <BookmarkDetail
        bookmark={FIXTURE}
        allBookmarks={[FIXTURE]}
        possibleTags={[]}
        onSave={onSave}
        onDelete={async () => {}}
        onClose={() => {}}
      />,
    );
    const titleInput = getByLabelText(/^Title$/i) as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "Edited" } });
    await act(async () => {
      fireEvent.keyDown(document, { key: "Enter", ctrlKey: true });
    });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("Cmd+Enter does not save when the drawer is clean", async () => {
    const onSave = vi.fn(async () => {});
    render(
      <BookmarkDetail
        bookmark={FIXTURE}
        allBookmarks={[FIXTURE]}
        possibleTags={[]}
        onSave={onSave}
        onDelete={async () => {}}
        onClose={() => {}}
      />,
    );
    fireEvent.keyDown(document, { key: "Enter", metaKey: true });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("bare Enter does NOT save (that's the row-open shortcut on the overview)", async () => {
    const onSave = vi.fn(async () => {});
    const { getByLabelText } = render(
      <BookmarkDetail
        bookmark={FIXTURE}
        allBookmarks={[FIXTURE]}
        possibleTags={[]}
        onSave={onSave}
        onDelete={async () => {}}
        onClose={() => {}}
      />,
    );
    const titleInput = getByLabelText(/^Title$/i) as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "Edited" } });
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onSave).not.toHaveBeenCalled();
  });
});
