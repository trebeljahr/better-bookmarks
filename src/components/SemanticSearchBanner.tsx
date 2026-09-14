/**
 * First-run banner offering to enable semantic search.
 *
 * Rendered above the search box in the sidepanel and inline in the
 * Options page semantic section. Off by default (see
 * `settings.semanticSearchEnabled`) so a fresh install makes no
 * network calls to huggingface.co — the banner is the opt-in surface.
 *
 * "Not now" persists `settings.semanticSearchBannerDismissedAt` so the
 * banner does not nag on every sidepanel open. "Enable now" flips the
 * setting, kicks the offscreen document, and shows a live download
 * progress bar backed by transformers.js progress events. See
 * docs/PRIVACY.md §3 and docs/SEMANTIC_SEARCH.md.
 */

import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ModelProgressEvent } from "@/core/semantic";
import { subscribeSemanticProgress, warmupSemanticSearch } from "@/core/semantic";
import { getSettings, setSettings } from "@/core/storage/settings";
import type { Settings } from "@/shared/types";

type Stage = "idle" | "downloading" | "ready" | "error";

export type SemanticSearchBannerProps = {
  /** Optional callback fired after settings mutate so the host page can refresh. */
  onSettingsChange?: (next: Settings) => void;
};

export function SemanticSearchBanner({ onSettingsChange }: SemanticSearchBannerProps) {
  const [settings, setLocalSettings] = useState<Settings | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [loaded, setLoaded] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await getSettings();
      if (cancelled) return;
      setLocalSettings(s);
      if (s.semanticSearchEnabled) setStage("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const unsub = subscribeSemanticProgress((ev: ModelProgressEvent) => {
      if (ev.status === "progress") {
        setStage("downloading");
        if (typeof ev.loaded === "number") setLoaded((prev) => Math.max(prev, ev.loaded ?? 0));
        if (typeof ev.total === "number") setTotal((prev) => Math.max(prev, ev.total ?? 0));
      } else if (ev.status === "ready") {
        setStage("ready");
      }
    });
    return unsub;
  }, []);

  const persist = useCallback(
    async (patch: Partial<Settings>) => {
      const next = await setSettings(patch);
      setLocalSettings(next);
      onSettingsChange?.(next);
      return next;
    },
    [onSettingsChange],
  );

  const handleEnable = useCallback(async () => {
    setStage("downloading");
    setError("");
    try {
      await persist({ semanticSearchEnabled: true });
      await warmupSemanticSearch();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage("error");
    }
  }, [persist]);

  const handleDismiss = useCallback(async () => {
    await persist({ semanticSearchBannerDismissedAt: Date.now() });
  }, [persist]);

  if (!settings) return null;

  // Once enabled + ready, the banner turns into a compact success line
  // for one render pass and then hides. The Options section is the
  // permanent home for the toggle.
  const banner = shouldRenderBanner(settings, stage);
  if (!banner) return null;

  const pct = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : null;

  return (
    <section
      className="flex flex-col gap-2 rounded-md border border-primary/30 bg-primary/5 p-3"
      aria-label="semantic search opt-in"
    >
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-xs leading-relaxed">
          Better Bookmarks supports semantic search — finds bookmarks by meaning, not just keywords.
          Enable now? (~33 MB one-time download.)
        </p>
        {stage !== "downloading" && (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="dismiss semantic search banner"
            title="Not now"
            onClick={handleDismiss}
          >
            <X />
          </Button>
        )}
      </div>
      {stage === "idle" && (
        <div className="flex gap-2">
          <Button size="sm" onClick={handleEnable}>
            Enable
          </Button>
          <Button size="sm" variant="outline" onClick={handleDismiss}>
            Not now
          </Button>
        </div>
      )}
      {stage === "downloading" && (
        <div className="flex flex-col gap-1" role="status" aria-live="polite">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Downloading model…</span>
            <span>
              {formatBytes(loaded)}
              {total > 0 ? ` / ${formatBytes(total)}` : ""}
              {pct !== null ? ` (${pct}%)` : ""}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: pct !== null ? `${pct}%` : "10%" }}
              aria-hidden="true"
            />
          </div>
        </div>
      )}
      {stage === "error" && (
        <p className="text-xs text-destructive" role="alert">
          Download failed: {error}. You can retry from Options → Semantic search.
        </p>
      )}
    </section>
  );
}

function shouldRenderBanner(settings: Settings, stage: Stage): boolean {
  if (stage === "downloading" || stage === "error") return true;
  if (settings.semanticSearchEnabled) return false;
  if (settings.semanticSearchBannerDismissedAt > 0) return false;
  return true;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
