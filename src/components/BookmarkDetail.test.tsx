// @vitest-environment happy-dom

/**
 * BookmarkDetail keyboard wiring and unlink routing.
 *
 * The drawer swallows Cmd/Ctrl+Enter as a "save now" chord so a user
 * editing the title or note can commit without reaching for the mouse.
 * It also owns the unlink flow: manual edges are just deleted, auto
 * edges additionally record a rejected pair so the suggester stops
 * proposing that pair.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bookmark, Edge } from "@/shared/types";

let mockEdges: Edge[] = [];

// The detail drawer imports edges hooks that reach IndexedDB — stub
// them so the render tree stays deterministic.
vi.mock("@/hooks/useEdges", () => ({
  useEdges: () => ({
    edges: mockEdges,
    suggestions: [],
    refresh: async () => {},
    loading: false,
  }),
}));

vi.mock("@/hooks/useBookmarkDnd", () => ({
  useBookmarkDragSource: () => ({}),
}));

const createEdgeMock = vi.fn(async () => "edge-id");
const deleteEdgeMock = vi.fn(async () => {});
const rejectEdgePairMock = vi.fn(async () => ({ pair: "", createdAt: 0 }));

vi.mock("@/core/edges/crud", () => ({
  createEdge: (...args: unknown[]) => createEdgeMock(...args),
  deleteEdge: (id: string) => deleteEdgeMock(id),
}));

vi.mock("@/core/edges/rejected", () => ({
  rejectEdgePair: (a: string, b: string) => rejectEdgePairMock(a, b),
}));

// The ConnectionsPanel imports the search runner (which pulls in Dexie
// under the hood). Replace it with a stub so the render tree doesn't
// touch IndexedDB.
vi.mock("@/core/search", () => ({
  search: async () => [],
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

beforeEach(() => {
  mockEdges = [];
  createEdgeMock.mockClear();
  deleteEdgeMock.mockClear();
  rejectEdgePairMock.mockClear();
});

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

const OTHER: Bookmark = {
  ...FIXTURE,
  id: "b2",
  originalUrl: "https://example.com/b",
  canonicalUrl: "https://example.com/b",
  title: "Other",
};

function makeEdge(overrides: Partial<Edge> = {}): Edge {
  return {
    id: "e1",
    fromId: FIXTURE.id,
    toId: OTHER.id,
    type: "related",
    note: "",
    directed: false,
    createdAt: 1,
    source: "manual",
    ...overrides,
  };
}

describe("BookmarkDetail unlink routing", () => {
  it("manual edge: unlink calls deleteEdge and does NOT reject the pair", async () => {
    mockEdges = [makeEdge({ id: "manual-1", source: "manual" })];
    const { getByLabelText } = render(
      <BookmarkDetail
        bookmark={FIXTURE}
        allBookmarks={[FIXTURE, OTHER]}
        possibleTags={[]}
        onSave={async () => {}}
        onDelete={async () => {}}
        onClose={() => {}}
      />,
    );
    const btn = getByLabelText(/remove manual connection to Other/i);
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(deleteEdgeMock).toHaveBeenCalledWith("manual-1");
    expect(rejectEdgePairMock).not.toHaveBeenCalled();
  });

  it("auto edge: unlink calls deleteEdge AND rejectEdgePair for the pair", async () => {
    mockEdges = [
      makeEdge({
        id: "auto-1",
        source: "auto-tag",
        fromId: FIXTURE.id,
        toId: OTHER.id,
      }),
    ];
    const { getByLabelText } = render(
      <BookmarkDetail
        bookmark={FIXTURE}
        allBookmarks={[FIXTURE, OTHER]}
        possibleTags={[]}
        onSave={async () => {}}
        onDelete={async () => {}}
        onClose={() => {}}
      />,
    );
    const btn = getByLabelText(/remove auto connection to Other/i);
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(deleteEdgeMock).toHaveBeenCalledWith("auto-1");
    expect(rejectEdgePairMock).toHaveBeenCalledWith(FIXTURE.id, OTHER.id);
  });
});
