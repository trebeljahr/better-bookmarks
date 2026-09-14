/**
 * GraphView — force-directed SVG rendering of the currently-visible
 * bookmark subset.
 *
 * Kept in its own module (default export) so `Overview.tsx` can pull
 * it in via `React.lazy(() => import("@/components/GraphView"))`. The
 * bundle cost of the layout math is trivial, but keeping the graph
 * lazy means the default overview never pays the SVG-render code
 * path when the setting is off — that's D-ish spec on the ticket.
 *
 * Responsibilities:
 *   - Compute `selectGraphSubset` on the passed bookmark/edge set.
 *   - Log the dropped count via `console.info` and show a small badge.
 *   - Seed positions with `initialLayout`, then step the simulation
 *     every animation frame until kinetic energy falls below a
 *     threshold (auto-cool).
 *   - Render nodes as circles coloured by primary tag; edges as lines
 *     whose stroke width scales with `edge.strength`.
 *   - Click a node → call `onOpenBookmark(id)` (the Overview wires this
 *     to `setSelectedId`, which surfaces the detail sheet).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { buildTagColorLookup, colorForTag } from "@/core/graph/color";
import {
  DEFAULT_LAYOUT_OPTIONS,
  initialLayout,
  type SimEdge,
  type SimNode,
  simulateStep,
  totalKineticEnergy,
} from "@/core/graph/layout";
import { GRAPH_NODE_CAP, selectGraphSubset } from "@/core/graph/subset";
import type { Bookmark, Edge, Tag } from "@/shared/types";

const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 600;
const MAX_STEPS = 400;
/**
 * Below this per-node KE the graph is essentially still; we stop the
 * rAF loop to save CPU. Restarts on any bookmark/edge input change.
 */
const KE_STILL_THRESHOLD = 0.05;

type Props = {
  visibleBookmarks: readonly Bookmark[];
  allEdges: readonly Edge[];
  tags: readonly Tag[];
  onOpenBookmark: (id: string) => void;
};

export default function GraphView({ visibleBookmarks, allEdges, tags, onOpenBookmark }: Props) {
  // A signature of the input identity — used to reset the simulation
  // when the query result subset changes. We deliberately don't reset
  // on every render (React re-runs on parent state churn), just when
  // the actual node/edge set differs.
  const subset = useMemo(
    () => selectGraphSubset(visibleBookmarks, allEdges),
    [visibleBookmarks, allEdges],
  );
  const tagColors = useMemo(() => buildTagColorLookup(tags), [tags]);

  // Log dropped-count once per subset change. `console.info` per the
  // spec — visible under the browser's default log filter but not
  // noise-level.
  useEffect(() => {
    if (subset.droppedNodeCount > 0) {
      console.info(
        `graph view: hiding ${subset.droppedNodeCount} bookmark(s) past ${GRAPH_NODE_CAP}-node cap`,
      );
    }
  }, [subset.droppedNodeCount]);

  const [tick, setTick] = useState(0);
  const nodesRef = useRef<SimNode[]>([]);
  const edgesRef = useRef<SimEdge[]>([]);
  const rafRef = useRef<number | null>(null);
  const stepsRunRef = useRef(0);

  // Seed the simulation and drive the animation loop. One effect so the
  // seed and the rAF loop share a lifecycle: when `subset` identity
  // changes (query results shifted), we seed fresh nodes AND restart
  // the loop; on unmount we cancel the outstanding frame.
  useEffect(() => {
    nodesRef.current = initialLayout(
      subset.nodes.map((n) => n.id),
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
    );
    edgesRef.current = subset.edges.map((e) => ({
      fromId: e.fromId,
      toId: e.toId,
      strength: e.strength,
    }));
    stepsRunRef.current = 0;
    // Force one paint at the initial layout before the rAF loop kicks in.
    setTick((t) => t + 1);

    let cancelled = false;
    const tickLoop = () => {
      if (cancelled) return;
      simulateStep(nodesRef.current, edgesRef.current, {
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        ...DEFAULT_LAYOUT_OPTIONS,
      });
      stepsRunRef.current++;
      setTick((t) => t + 1);
      const ke = totalKineticEnergy(nodesRef.current);
      const perNode = nodesRef.current.length > 0 ? ke / nodesRef.current.length : 0;
      if (perNode < KE_STILL_THRESHOLD || stepsRunRef.current >= MAX_STEPS) return;
      rafRef.current = requestAnimationFrame(tickLoop);
    };
    if (nodesRef.current.length > 0) {
      rafRef.current = requestAnimationFrame(tickLoop);
    }
    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [subset]);

  // O(1) position lookup by id. Rebuilt every animation frame — that's
  // the whole point of `tick` in the dep list. Biome would otherwise
  // flag it as unused because it's a re-render trigger, not a value.
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick is the rebuild trigger
  const simIndex = useMemo(() => {
    const m = new Map<string, SimNode>();
    for (const n of nodesRef.current) m.set(n.id, n);
    return m;
  }, [tick]);

  const nodesForRender = subset.nodes;
  const edgesForRender = subset.edges;
  const maxStrength = useMemo(() => {
    let m = 1;
    for (const e of edgesForRender) if (e.strength > m) m = e.strength;
    return m;
  }, [edgesForRender]);

  if (nodesForRender.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
        No bookmarks match the current filter — nothing to graph.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {nodesForRender.length} node{nodesForRender.length === 1 ? "" : "s"} ·{" "}
          {edgesForRender.length} edge{edgesForRender.length === 1 ? "" : "s"}
        </span>
        {subset.droppedNodeCount > 0 && (
          <Badge
            variant="outline"
            aria-label={`${subset.droppedNodeCount} nodes hidden past the ${GRAPH_NODE_CAP}-node cap`}
          >
            {subset.droppedNodeCount} node{subset.droppedNodeCount === 1 ? "" : "s"} hidden
          </Badge>
        )}
      </div>
      <div className="overflow-hidden rounded-md border bg-background">
        <svg
          role="img"
          aria-label={`Force-directed graph of ${nodesForRender.length} bookmarks`}
          viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ width: "100%", height: "auto", display: "block" }}
        >
          <title>Bookmark graph</title>
          <g stroke="currentColor" strokeOpacity={0.35}>
            {edgesForRender.map((e) => {
              const a = simIndex.get(e.fromId);
              const b = simIndex.get(e.toId);
              if (!a || !b) return null;
              // Width scales linearly with strength, clamped [1, 4] so
              // a runaway auto-suggestion score can't render a fat bar
              // that swamps the layout.
              const w = 1 + 3 * (e.strength / maxStrength);
              return <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={w} />;
            })}
          </g>
          <g>
            {nodesForRender.map((n) => {
              const p = simIndex.get(n.id);
              if (!p) return null;
              const fill = colorForTag(n.primaryTag, tagColors);
              // Node radius grows sub-linearly with degree so hubs read
              // as bigger without overwhelming the canvas.
              const r = 5 + Math.min(8, Math.sqrt(n.degree));
              return (
                <g
                  key={n.id}
                  transform={`translate(${p.x} ${p.y})`}
                  style={{ cursor: "pointer" }}
                  onClick={() => onOpenBookmark(n.id)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      onOpenBookmark(n.id);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`open bookmark ${n.label}`}
                >
                  <title>{n.label}</title>
                  <circle r={r} fill={fill} stroke="var(--background, #fff)" strokeWidth={1.5} />
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}
