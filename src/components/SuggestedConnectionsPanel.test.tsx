// @vitest-environment happy-dom

/**
 * SuggestedConnectionsPanel — component tests.
 *
 * Covers the four load-bearing pieces of the panel:
 *   - endpoint labels + domain fallbacks (missing bookmark handling)
 *   - Accept / Reject buttons call the right handler with the raw edge
 *   - the strength meter's aria-valuenow tracks `edge.strength`
 *   - the batch bar honors the threshold slider and calls onBatchAccept
 *     with only the edges above N
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Bookmark, Edge } from "@/shared/types";

const { act, cleanup, fireEvent, render } = await import("@testing-library/react");
const { SuggestedConnectionsPanel } = await import("@/components/SuggestedConnectionsPanel");

afterEach(() => cleanup());

function bookmark(overrides: Partial<Bookmark> & Pick<Bookmark, "id">): Bookmark {
  return {
    originalUrl: `https://example.com/${overrides.id}`,
    canonicalUrl: `https://example.com/${overrides.id}`,
    domain: "example.com",
    title: `Bookmark ${overrides.id}`,
    description: "",
    note: "",
    tags: [],
    rating: null,
    necessaryTime: null,
    contentType: "article",
    language: null,
    status: "unread",
    readAt: null,
    createdAt: 1,
    updatedAt: 1,
    capturedFrom: "manual",
    ...overrides,
  };
}

function edge(overrides: Partial<Edge> & Pick<Edge, "id" | "fromId" | "toId">): Edge {
  return {
    type: "related",
    note: "",
    directed: false,
    createdAt: 1,
    source: "auto-tag",
    strength: 0.5,
    ...overrides,
  } as Edge;
}

function makeMap(bs: Bookmark[]): Map<string, Bookmark> {
  const m = new Map<string, Bookmark>();
  for (const b of bs) m.set(b.id, b);
  return m;
}

describe("SuggestedConnectionsPanel", () => {
  it("renders the empty state with the panel heading when there are no edges", () => {
    const { getByText, getByLabelText } = render(
      <SuggestedConnectionsPanel
        edges={[]}
        bookmarksById={new Map()}
        onAccept={() => {}}
        onReject={() => {}}
      />,
    );
    expect(getByText(/Suggested connections/i)).toBeTruthy();
    expect(getByLabelText(/suggestion count/i).textContent).toBe("0");
    expect(getByText(/No suggestions yet/i)).toBeTruthy();
  });

  it("shows an em-dash count while loading and hides the empty state copy", () => {
    const { getByLabelText, queryByText } = render(
      <SuggestedConnectionsPanel
        edges={[]}
        bookmarksById={new Map()}
        onAccept={() => {}}
        onReject={() => {}}
        loading
      />,
    );
    expect(getByLabelText(/suggestion count/i).textContent).toBe("—");
    expect(queryByText(/No suggestions yet/i)).toBeNull();
  });

  it("renders one row per edge with from → to labels, domains, and formatted rule chips", () => {
    const bs = [
      bookmark({ id: "a", title: "React 19 release", domain: "react.dev" }),
      bookmark({ id: "b", title: "Next.js 16 notes", domain: "nextjs.org" }),
    ];
    const e = edge({
      id: "e1",
      fromId: "a",
      toId: "b",
      strength: 0.72,
      sourceRules: ["sharedTag:react", "sharedDomain", "textSimilarity:0.62"],
    });
    const { getByLabelText, getByText, container } = render(
      <SuggestedConnectionsPanel
        edges={[e]}
        bookmarksById={makeMap(bs)}
        onAccept={() => {}}
        onReject={() => {}}
      />,
    );
    expect(getByText("React 19 release")).toBeTruthy();
    expect(getByText("Next.js 16 notes")).toBeTruthy();
    expect(getByText("react.dev")).toBeTruthy();
    expect(getByText("nextjs.org")).toBeTruthy();

    // Rule chips rendered with the friendly labels.
    const rules = container.querySelector<HTMLElement>(
      '[data-testid="suggested-connection-rules"]',
    );
    expect(rules).toBeTruthy();
    expect(rules?.textContent).toContain("tag: react");
    expect(rules?.textContent).toContain("same domain");
    expect(rules?.textContent).toContain("text: 62%");

    // Meter reflects strength.
    const meter = getByLabelText(/strength 0\.72 of 1/i);
    expect(meter.getAttribute("aria-valuenow")).toBe("0.72");
  });

  it("falls back to a `(missing …)` label when the endpoint bookmark is unknown", () => {
    const bs = [bookmark({ id: "a", title: "Alpha" })];
    const e = edge({ id: "orphan", fromId: "a", toId: "ghost-id-1234", strength: 0.4 });
    const { getByText } = render(
      <SuggestedConnectionsPanel
        edges={[e]}
        bookmarksById={makeMap(bs)}
        onAccept={() => {}}
        onReject={() => {}}
      />,
    );
    expect(getByText(/\(missing ghost-/i)).toBeTruthy();
  });

  it("calls onAccept with the exact edge when the Accept button is clicked", async () => {
    const bs = [bookmark({ id: "a" }), bookmark({ id: "b" })];
    const e = edge({ id: "e1", fromId: "a", toId: "b" });
    const onAccept = vi.fn();
    const { getByLabelText } = render(
      <SuggestedConnectionsPanel
        edges={[e]}
        bookmarksById={makeMap(bs)}
        onAccept={onAccept}
        onReject={() => {}}
      />,
    );
    await act(async () => {
      fireEvent.click(getByLabelText(/^accept suggestion Bookmark a to Bookmark b$/i));
    });
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onAccept).toHaveBeenCalledWith(e);
  });

  it("calls onReject with the exact edge when the Reject button is clicked", async () => {
    const bs = [bookmark({ id: "a" }), bookmark({ id: "b" })];
    const e = edge({ id: "e1", fromId: "a", toId: "b" });
    const onReject = vi.fn();
    const { getByLabelText } = render(
      <SuggestedConnectionsPanel
        edges={[e]}
        bookmarksById={makeMap(bs)}
        onAccept={() => {}}
        onReject={onReject}
      />,
    );
    await act(async () => {
      fireEvent.click(getByLabelText(/^reject suggestion Bookmark a to Bookmark b$/i));
    });
    expect(onReject).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledWith(e);
  });

  it("hides the batch bar when onBatchAccept is not provided", () => {
    const bs = [bookmark({ id: "a" }), bookmark({ id: "b" })];
    const e = edge({ id: "e1", fromId: "a", toId: "b" });
    const { queryByTestId } = render(
      <SuggestedConnectionsPanel
        edges={[e]}
        bookmarksById={makeMap(bs)}
        onAccept={() => {}}
        onReject={() => {}}
      />,
    );
    expect(queryByTestId("suggested-connections-batch-bar")).toBeNull();
  });

  it("defaults the threshold slider to the highest-scored edge so the first click is scoped", async () => {
    const bs = [bookmark({ id: "a" }), bookmark({ id: "b" }), bookmark({ id: "c" })];
    const edges = [
      edge({ id: "hi", fromId: "a", toId: "b", strength: 0.9 }),
      edge({ id: "mid", fromId: "a", toId: "c", strength: 0.5 }),
    ];
    const onBatchAccept = vi.fn();
    const { getByLabelText } = render(
      <SuggestedConnectionsPanel
        edges={edges}
        bookmarksById={makeMap(bs)}
        onAccept={() => {}}
        onReject={() => {}}
        onBatchAccept={onBatchAccept}
      />,
    );
    // Slider defaults to 0.9 → only the top row is in scope.
    await act(async () => {
      fireEvent.click(getByLabelText(/^accept 1 suggestions above strength 0\.90$/i));
    });
    expect(onBatchAccept).toHaveBeenCalledTimes(1);
    const arg = onBatchAccept.mock.calls[0][0] as Edge[];
    expect(arg.map((e) => e.id)).toEqual(["hi"]);
  });

  it("dragging the threshold slider down widens the batch", async () => {
    const bs = [
      bookmark({ id: "a" }),
      bookmark({ id: "b" }),
      bookmark({ id: "c" }),
      bookmark({ id: "d" }),
    ];
    const edges = [
      edge({ id: "hi", fromId: "a", toId: "b", strength: 0.9 }),
      edge({ id: "mid", fromId: "a", toId: "c", strength: 0.5 }),
      edge({ id: "lo", fromId: "a", toId: "d", strength: 0.1 }),
    ];
    const onBatchAccept = vi.fn();
    const { getByLabelText } = render(
      <SuggestedConnectionsPanel
        edges={edges}
        bookmarksById={makeMap(bs)}
        onAccept={() => {}}
        onReject={() => {}}
        onBatchAccept={onBatchAccept}
      />,
    );
    const slider = getByLabelText(/strength threshold for batch accept/i) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(slider, { target: { value: "0.5" } });
    });
    await act(async () => {
      fireEvent.click(getByLabelText(/^accept 2 suggestions above strength 0\.50$/i));
    });
    expect(onBatchAccept).toHaveBeenCalledTimes(1);
    const arg = onBatchAccept.mock.calls[0][0] as Edge[];
    expect(arg.map((e) => e.id).sort()).toEqual(["hi", "mid"]);
  });

  it("disables the batch button when nothing is above the current threshold", async () => {
    const bs = [bookmark({ id: "a" }), bookmark({ id: "b" })];
    const edges = [edge({ id: "hi", fromId: "a", toId: "b", strength: 0.3 })];
    const { getByLabelText } = render(
      <SuggestedConnectionsPanel
        edges={edges}
        bookmarksById={makeMap(bs)}
        onAccept={() => {}}
        onReject={() => {}}
        onBatchAccept={() => {}}
      />,
    );
    const slider = getByLabelText(/strength threshold for batch accept/i) as HTMLInputElement;
    // Slider defaults to max (0.3). Drag it up past the top row.
    await act(async () => {
      fireEvent.change(slider, { target: { value: "1" } });
    });
    // Clamped back to 0.3 so the top row still qualifies.
    const btn = getByLabelText(/^accept 1 suggestions above strength 0\.30$/i);
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });
});
