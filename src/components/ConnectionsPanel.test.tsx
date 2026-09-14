// @vitest-environment happy-dom

/**
 * ConnectionsPanel — grouped Manual/Auto display, unlink surfacing, and
 * the search-driven bookmark picker.
 *
 * The panel is presentation-only: it groups stored edges by `source`,
 * routes unlink clicks to a callback prop (the parent decides whether
 * to reject the pair), and drives the picker off an injected `searchFn`
 * so the test can pin what the Phase 3 `search()` runner would return.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Bookmark, Edge } from "@/shared/types";

const { render, cleanup, fireEvent, screen, within, waitFor } = await import(
  "@testing-library/react"
);
const { ConnectionsPanel } = await import("@/components/ConnectionsPanel");

const SUBJECT: Bookmark = {
  id: "b1",
  originalUrl: "https://example.com/a",
  canonicalUrl: "https://example.com/a",
  domain: "example.com",
  title: "Subject",
  description: "",
  note: "",
  rating: null,
  necessaryTime: null,
  status: "unread",
  contentType: "article",
  language: null,
  tags: [],
  readAt: null,
  createdAt: 1,
  updatedAt: 1,
  capturedFrom: "manual",
};

const OTHER_A: Bookmark = {
  ...SUBJECT,
  id: "b2",
  originalUrl: "https://example.com/b",
  canonicalUrl: "https://example.com/b",
  title: "Other A",
};

const OTHER_B: Bookmark = {
  ...SUBJECT,
  id: "b3",
  originalUrl: "https://example.com/c",
  canonicalUrl: "https://example.com/c",
  title: "Other B",
};

const OTHER_C: Bookmark = {
  ...SUBJECT,
  id: "b4",
  originalUrl: "https://another.example/x",
  canonicalUrl: "https://another.example/x",
  domain: "another.example",
  title: "Search Target",
};

function makeEdge(overrides: Partial<Edge>): Edge {
  return {
    id: "edge",
    fromId: SUBJECT.id,
    toId: OTHER_A.id,
    type: "related",
    note: "",
    directed: false,
    createdAt: 1,
    source: "manual",
    ...overrides,
  };
}

// The panel's default searchFn hits the search runner (Dexie). Every
// test that renders the panel passes an in-memory stub instead.
const noopSearch = async () => [];

afterEach(() => {
  cleanup();
});

describe("ConnectionsPanel — grouped edges", () => {
  it("splits edges into Manual and Auto sections", () => {
    const edges: Edge[] = [
      makeEdge({ id: "m1", toId: OTHER_A.id, source: "manual" }),
      makeEdge({ id: "a1", toId: OTHER_B.id, source: "auto-tag" }),
    ];
    render(
      <ConnectionsPanel
        bookmark={SUBJECT}
        allBookmarks={[SUBJECT, OTHER_A, OTHER_B]}
        edges={edges}
        suggestions={[]}
        onLink={() => {}}
        onUnlink={() => {}}
        onAcceptSuggestion={() => {}}
        searchFn={noopSearch}
      />,
    );

    const manualSection = screen.getByLabelText("Manual connections");
    const autoSection = screen.getByLabelText("Auto connections");
    expect(within(manualSection).getByText(/Other A/)).toBeTruthy();
    expect(within(autoSection).getByText(/Other B/)).toBeTruthy();
    // Manual chips carry no auto chip label and vice versa.
    expect(within(manualSection).queryByText(/Other B/)).toBeNull();
    expect(within(autoSection).queryByText(/Other A/)).toBeNull();
  });

  it("displays edges where the current bookmark is on the toId side (bidirectional)", () => {
    const incoming = makeEdge({
      id: "in1",
      fromId: OTHER_A.id,
      toId: SUBJECT.id,
      source: "manual",
      directed: true,
    });
    render(
      <ConnectionsPanel
        bookmark={SUBJECT}
        allBookmarks={[SUBJECT, OTHER_A]}
        edges={[incoming]}
        suggestions={[]}
        onLink={() => {}}
        onUnlink={() => {}}
        onAcceptSuggestion={() => {}}
        searchFn={noopSearch}
      />,
    );
    const manualSection = screen.getByLabelText("Manual connections");
    // Direction hint should point into the subject (←) since we are the toId.
    expect(within(manualSection).getByText(/Other A/)).toBeTruthy();
    expect(within(manualSection).getByText(/←/)).toBeTruthy();
  });

  it("unlink click surfaces the full edge object to the parent", async () => {
    const onUnlink = vi.fn();
    const manualEdge = makeEdge({ id: "m1", toId: OTHER_A.id, source: "manual" });
    const autoEdge = makeEdge({ id: "a1", toId: OTHER_B.id, source: "auto-domain" });
    render(
      <ConnectionsPanel
        bookmark={SUBJECT}
        allBookmarks={[SUBJECT, OTHER_A, OTHER_B]}
        edges={[manualEdge, autoEdge]}
        suggestions={[]}
        onLink={() => {}}
        onUnlink={onUnlink}
        onAcceptSuggestion={() => {}}
        searchFn={noopSearch}
      />,
    );
    fireEvent.click(screen.getByLabelText(/remove manual connection to Other A/i));
    fireEvent.click(screen.getByLabelText(/remove auto connection to Other B/i));
    expect(onUnlink).toHaveBeenCalledTimes(2);
    expect(onUnlink.mock.calls[0][0]).toMatchObject({ id: "m1", source: "manual" });
    expect(onUnlink.mock.calls[1][0]).toMatchObject({ id: "a1", source: "auto-domain" });
  });
});

describe("ConnectionsPanel — search picker", () => {
  it("routes typed queries through the injected search() and posts the pick as a manual link", async () => {
    const searchFn = vi.fn(async (_q: string) => [OTHER_C]);
    const onLink = vi.fn();

    render(
      <ConnectionsPanel
        bookmark={SUBJECT}
        allBookmarks={[SUBJECT]}
        edges={[]}
        suggestions={[]}
        onLink={onLink}
        onUnlink={() => {}}
        onAcceptSuggestion={() => {}}
        searchFn={searchFn}
      />,
    );

    // Open the popover and type into the picker.
    fireEvent.click(screen.getByLabelText(/link to another bookmark/i));
    const input = await screen.findByPlaceholderText(/search bookmarks/i);
    fireEvent.change(input, { target: { value: "target" } });

    await waitFor(() => {
      expect(searchFn.mock.calls.at(-1)?.[0]).toBe("target");
    });

    // Pick the returned result.
    fireEvent.click(await screen.findByText("Search Target"));
    fireEvent.click(screen.getByLabelText(/add connection/i));

    expect(onLink).toHaveBeenCalledTimes(1);
    expect(onLink.mock.calls[0][0]).toBe(OTHER_C.id);
    expect(onLink.mock.calls[0][1]).toBe("related");
  });

  it("excludes the subject and already-linked bookmarks from the picker", async () => {
    const searchFn = vi.fn(async () => [SUBJECT, OTHER_A, OTHER_C]);
    const alreadyLinked = makeEdge({
      id: "m1",
      fromId: SUBJECT.id,
      toId: OTHER_A.id,
      source: "manual",
    });

    render(
      <ConnectionsPanel
        bookmark={SUBJECT}
        allBookmarks={[SUBJECT, OTHER_A, OTHER_C]}
        edges={[alreadyLinked]}
        suggestions={[]}
        onLink={() => {}}
        onUnlink={() => {}}
        onAcceptSuggestion={() => {}}
        searchFn={searchFn}
      />,
    );

    fireEvent.click(screen.getByLabelText(/link to another bookmark/i));

    // The only surviving option should be OTHER_C — SUBJECT is the
    // subject, OTHER_A is already linked.
    expect(await screen.findByText("Search Target")).toBeTruthy();
    expect(searchFn).toHaveBeenCalled();
    expect(screen.queryByText("Subject")).toBeNull();
    expect(screen.queryByText("Other A")).toBeNull();
  });
});
