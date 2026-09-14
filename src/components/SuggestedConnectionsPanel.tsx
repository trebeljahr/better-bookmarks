/**
 * SuggestedConnectionsPanel — read-side surface for the auto sweep.
 *
 * Renders top-K auto-* edges as one row each: from → to (title +
 * domain), a strength meter, sourceRules chips explaining why the pair
 * matched, and Accept / Reject buttons. Accept upgrades the row's
 * `source` to `manual` (so the connections list picks it up); Reject
 * deletes it and blacklists the pair in `rejectedEdgePairs` so the next
 * sweep skips it forever.
 *
 * A "Accept all above N" button batches the top slice into a single
 * write. The threshold slider defaults to whatever the highest-scored
 * row scores at, so the first click is safe: users see exactly what
 * would be promoted.
 */

import { ArrowRight, Check, Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Bookmark, Edge } from "@/shared/types";

export type SuggestedConnectionRow = {
  edge: Edge;
  from: Bookmark | null;
  to: Bookmark | null;
};

export type SuggestedConnectionsPanelProps = {
  /**
   * Ranked edges to render — the caller controls scope (global vs.
   * per-bookmark) and ordering. The panel is pure presentation.
   */
  edges: readonly Edge[];
  /** Bookmark lookup for resolving edge endpoints to titles / domains. */
  bookmarksById: ReadonlyMap<string, Bookmark>;
  /** Called with the edge id when the user hits Accept on one row. */
  onAccept: (edge: Edge) => void | Promise<void>;
  /** Called with the edge when the user hits Reject on one row. */
  onReject: (edge: Edge) => void | Promise<void>;
  /**
   * Called with every edge id above the batch threshold. Optional — omit
   * to hide the batch bar (useful for narrow surfaces or when the caller
   * wants a per-row-only interaction).
   */
  onBatchAccept?: (edges: readonly Edge[]) => void | Promise<void>;
  /** Panel heading; defaults to "Suggested connections". */
  title?: string;
  /** Empty-state copy; defaults to a neutral message. */
  emptyMessage?: string;
  /** Loading = show the count badge as an em-dash and skip the empty state. */
  loading?: boolean;
  /**
   * Optional class hook so callers can slot the panel into their own
   * layout without wrapping it in another div.
   */
  className?: string;
};

/**
 * Convert a 0..1 strength score to a percentage for the meter.
 * Auto-suggester scores currently top out at 1.0 (0.4 + 0.3 + 0.3), but
 * we clamp defensively.
 */
function strengthPct(strength: number | undefined): number {
  if (typeof strength !== "number" || Number.isNaN(strength)) return 0;
  return Math.max(0, Math.min(100, strength * 100));
}

/**
 * Format a `sourceRules` entry as a short human chip. The raw values
 * come from `autoSuggest.evaluatePair` — `sharedTag:react`,
 * `sharedDomain`, `textSimilarity:0.62`.
 */
function formatRule(rule: string): string {
  const colon = rule.indexOf(":");
  if (colon === -1) {
    if (rule === "sharedDomain") return "same domain";
    return rule;
  }
  const kind = rule.slice(0, colon);
  const value = rule.slice(colon + 1);
  if (kind === "sharedTag") return `tag: ${value}`;
  if (kind === "textSimilarity") {
    const n = Number(value);
    if (!Number.isFinite(n)) return `text ${value}`;
    return `text: ${Math.round(n * 100)}%`;
  }
  return `${kind}: ${value}`;
}

/**
 * Prettified endpoint label. Falls back to the id when the bookmark is
 * unknown (deleted since the sweep wrote the row — the read side never
 * blocks on a stale reference).
 */
function endpointLabel(bookmark: Bookmark | null, fallbackId: string): string {
  if (!bookmark) return `(missing ${fallbackId.slice(0, 6)}…)`;
  return bookmark.title || bookmark.canonicalUrl || fallbackId;
}

function endpointDomain(bookmark: Bookmark | null): string {
  return bookmark?.domain ?? "";
}

export function SuggestedConnectionsPanel({
  edges,
  bookmarksById,
  onAccept,
  onReject,
  onBatchAccept,
  title = "Suggested connections",
  emptyMessage = "No suggestions yet — the background sweep will surface high-signal pairs here as it runs.",
  loading = false,
  className,
}: SuggestedConnectionsPanelProps) {
  const rows = useMemo<SuggestedConnectionRow[]>(
    () =>
      edges.map((edge) => ({
        edge,
        from: bookmarksById.get(edge.fromId) ?? null,
        to: bookmarksById.get(edge.toId) ?? null,
      })),
    [edges, bookmarksById],
  );

  const maxStrength = useMemo(() => {
    let max = 0;
    for (const e of edges) {
      const s = e.strength ?? 0;
      if (s > max) max = s;
    }
    return max;
  }, [edges]);

  // The threshold slider defaults to the highest-scored row. That
  // matches the "Accept all above N" phrasing — the first click promotes
  // only the very top, and the user can drag the slider down to widen
  // the batch. Kept in local state so a Dexie refresh doesn't reset it
  // mid-interaction; a fresh threshold above the new max gets clamped
  // in the derived selection below.
  const [threshold, setThreshold] = useState<number>(() => maxStrength);

  const clampedThreshold = Math.min(threshold, maxStrength);
  const batchTargets = useMemo<Edge[]>(
    () => edges.filter((e) => (e.strength ?? 0) >= clampedThreshold),
    [edges, clampedThreshold],
  );

  return (
    <section
      aria-label={title}
      className={["flex flex-col gap-3", className].filter(Boolean).join(" ")}
    >
      <header className="flex items-center gap-2">
        <Sparkles className="size-4 text-muted-foreground" aria-hidden="true" />
        <h3 className="text-sm font-medium">{title}</h3>
        <span
          className="ml-1 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
          aria-label="suggestion count"
        >
          {loading ? "—" : edges.length}
        </span>
      </header>

      {!loading && edges.length === 0 && (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      )}

      {edges.length > 0 && onBatchAccept && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-md border border-dashed bg-muted/40 p-2"
          data-testid="suggested-connections-batch-bar"
        >
          <label
            htmlFor="bb-suggestion-threshold"
            className="text-xs font-medium text-muted-foreground"
          >
            Accept all above
          </label>
          <input
            id="bb-suggestion-threshold"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={clampedThreshold}
            onChange={(ev) => setThreshold(Number(ev.target.value))}
            className="h-1 w-32 cursor-pointer accent-primary"
            aria-label="strength threshold for batch accept"
          />
          <span className="min-w-[2.5rem] tabular-nums text-xs text-muted-foreground">
            {clampedThreshold.toFixed(2)}
          </span>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="default"
            onClick={() => onBatchAccept(batchTargets)}
            disabled={batchTargets.length === 0}
            aria-label={`accept ${batchTargets.length} suggestions above strength ${clampedThreshold.toFixed(
              2,
            )}`}
          >
            <Check /> Accept {batchTargets.length}
          </Button>
        </div>
      )}

      {rows.length > 0 && (
        <ul className="flex flex-col gap-2 p-0">
          {rows.map((row) => (
            <SuggestedConnectionRowView
              key={row.edge.id}
              row={row}
              onAccept={onAccept}
              onReject={onReject}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

type RowViewProps = {
  row: SuggestedConnectionRow;
  onAccept: (edge: Edge) => void | Promise<void>;
  onReject: (edge: Edge) => void | Promise<void>;
};

function SuggestedConnectionRowView({ row, onAccept, onReject }: RowViewProps) {
  const { edge, from, to } = row;
  const fromLabel = endpointLabel(from, edge.fromId);
  const toLabel = endpointLabel(to, edge.toId);
  const fromDomain = endpointDomain(from);
  const toDomain = endpointDomain(to);
  const pct = strengthPct(edge.strength);
  const rules = edge.sourceRules ?? [];
  const rowLabel = `Suggested connection ${fromLabel} to ${toLabel}`;

  return (
    <li
      className="flex flex-col gap-2 rounded-md border bg-card p-2"
      data-testid="suggested-connection-row"
      data-edge-id={edge.id}
      aria-label={rowLabel}
    >
      <div className="flex min-w-0 flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{fromLabel}</span>
            <ArrowRight className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{toLabel}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {fromDomain && <span className="truncate">{fromDomain}</span>}
            {fromDomain && toDomain && <span aria-hidden="true">→</span>}
            {toDomain && <span className="truncate">{toDomain}</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            aria-label={`accept suggestion ${fromLabel} to ${toLabel}`}
            onClick={() => onAccept(edge)}
          >
            <Check /> Accept
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={`reject suggestion ${fromLabel} to ${toLabel}`}
            onClick={() => onReject(edge)}
          >
            <X /> Reject
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
          role="meter"
          aria-label={`strength ${(edge.strength ?? 0).toFixed(2)} of 1`}
          aria-valuemin={0}
          aria-valuemax={1}
          aria-valuenow={edge.strength ?? 0}
        >
          <div
            className="h-full bg-primary transition-[width]"
            style={{ width: `${pct}%` }}
            data-testid="strength-meter-fill"
          />
        </div>
        <span className="min-w-[2.75rem] shrink-0 text-right tabular-nums text-xs text-muted-foreground">
          {(edge.strength ?? 0).toFixed(2)}
        </span>
      </div>

      {rules.length > 0 && (
        <ul className="flex flex-wrap gap-1 p-0" data-testid="suggested-connection-rules">
          {rules.map((rule) => (
            <li key={rule}>
              <Badge variant="outline" className="text-[10px] font-normal">
                {formatRule(rule)}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
