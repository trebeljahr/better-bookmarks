/**
 * Bookmark Health page.
 *
 * One-shot scan over the corpus. Two top sections: scanner toggles +
 * findings (split by Stubs / Soft duplicates / Dismissed). Per-row
 * review opens a right-side Sheet. Destructive actions snapshot to an
 * in-memory undo buffer and surface a 30s toast.
 *
 * See docs/BOOKMARK_HEALTH.md.
 */
import { CheckCheck, ChevronLeft, HeartPulse, Loader2, RefreshCw } from "lucide-react";
import type * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FindingCard } from "@/components/health/FindingCard";
import { FindingReviewSheet } from "@/components/health/FindingReviewSheet";
import { ScannerToggleRow } from "@/components/health/ScannerToggleRow";
import { UndoToast } from "@/components/health/UndoToast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  applyFinding,
  fingerprintForFinding,
  type HealthAction,
  type HealthFinding,
  listScanners,
  runHealthScan,
  SCANNER_REGISTRY,
  type Scanner,
  type ScanResult,
  type UndoSnapshot,
  undoBuffer,
  undoSnapshot,
} from "@/core/health";
import { runDeadLinkSweep } from "@/core/maintenance";
import { listBookmarks } from "@/core/storage/bookmarks";
import { getSettings, setSettings } from "@/core/storage/settings";
import { listTags } from "@/core/storage/tags";
import { listAllMappings } from "@/core/sync/mapping";
import { cn } from "@/lib/utils";
import type { Bookmark, ChromeMapping, Settings, Tag } from "@/shared/types";

type TabId = "stubs" | "duplicates" | "dismissed";

type LoadedCtx = {
  bookmarks: Bookmark[];
  mappings: ChromeMapping[];
  tags: Tag[];
  folderTitleByChromeId: Map<string, string>;
};

function isDupFinding(f: HealthFinding): boolean {
  return f.kind.startsWith("dup-");
}

function isStubFinding(f: HealthFinding): boolean {
  return !isDupFinding(f);
}

function scannerEnabledFor(scanner: Scanner, settings: Settings): boolean {
  const override = settings.healthEnabledScanners[scanner.id];
  if (override === undefined) return scanner.enabledByDefault;
  return override;
}

function backToOverview() {
  const url = chrome?.runtime?.getURL ? chrome.runtime.getURL("overview.html") : "/overview.html";
  if (chrome?.tabs?.update) {
    chrome.tabs
      .getCurrent()
      .then((tab) => {
        if (tab?.id) chrome.tabs.update(tab.id, { url });
        else window.location.href = url;
      })
      .catch(() => {
        window.location.href = url;
      });
  } else {
    window.location.href = url;
  }
}

function openOverviewEdit(bookmarkId: string): void {
  const url = chrome?.runtime?.getURL
    ? chrome.runtime.getURL(`overview.html#edit=${encodeURIComponent(bookmarkId)}`)
    : `/overview.html#edit=${encodeURIComponent(bookmarkId)}`;
  if (chrome?.tabs?.create) {
    chrome.tabs.create({ url }).catch(() => window.open(url, "_blank"));
  } else {
    window.open(url, "_blank");
  }
}

export const Health = () => {
  const [settings, setLocalSettings] = useState<Settings | null>(null);
  const [loadedCtx, setLoadedCtx] = useState<LoadedCtx | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<TabId>("stubs");
  const [activeFindingId, setActiveFindingId] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [undoSnapshots, setUndoSnapshots] = useState<UndoSnapshot[]>([]);
  const [bulkDialogOpen, setBulkDialogOpen] = useState<boolean>(false);
  const [bulkSecondsLeft, setBulkSecondsLeft] = useState<number>(3);
  const [statusMessage, setStatusMessage] = useState<string>("");

  const scanners = useMemo(() => listScanners(SCANNER_REGISTRY), []);

  const reloadCorpus = useCallback(async (): Promise<LoadedCtx> => {
    const [bookmarks, mappings, tags] = await Promise.all([
      listBookmarks(),
      listAllMappings(),
      listTags(),
    ]);
    const folderTitleByChromeId = new Map<string, string>();
    for (const m of mappings) {
      if (m.isFolder) folderTitleByChromeId.set(m.chromeId, m.lastKnownTitle);
    }
    const next: LoadedCtx = { bookmarks, mappings, tags, folderTitleByChromeId };
    setLoadedCtx(next);
    return next;
  }, []);

  // -- bootstrap: load settings + corpus once --
  useEffect(() => {
    (async () => {
      const s = await getSettings();
      setLocalSettings(s);
      await reloadCorpus();
    })();
  }, [reloadCorpus]);

  // -- subscribe to undo buffer --
  useEffect(() => {
    const unsubscribe = undoBuffer.subscribe(() => {
      setUndoSnapshots(undoBuffer.list());
    });
    setUndoSnapshots(undoBuffer.list());
    const prune = setInterval(() => {
      undoBuffer.pruneExpired();
    }, 1000);
    return () => {
      unsubscribe();
      clearInterval(prune);
    };
  }, []);

  // -- run scan --
  const runScan = useCallback(async () => {
    if (!settings) return;
    setScanning(true);
    setStatusMessage("");
    try {
      const ctx = await reloadCorpus();
      const result = await runHealthScan({
        bookmarks: ctx.bookmarks,
        settings,
        mappings: ctx.mappings,
        tags: ctx.tags,
      });
      setScanResult(result);
      setReviewed(new Set());
    } catch (err) {
      console.error("[health] scan failed", err);
      setStatusMessage(`scan failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setScanning(false);
    }
  }, [settings, reloadCorpus]);

  // -- run dead-link sweep then rescan --
  const runBrokenLinkSweep = useCallback(async () => {
    setScanning(true);
    setStatusMessage("running dead-link sweep…");
    try {
      const { checked, dead } = await runDeadLinkSweep();
      setStatusMessage(`dead-link sweep: ${checked} checked, ${dead} dead`);
      await runScan();
    } catch (err) {
      console.error("[health] dead-link sweep failed", err);
      setStatusMessage(
        `dead-link sweep failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setScanning(false);
    }
  }, [runScan]);

  // -- compute visible findings (filter dismissed + tab + reviewed) --
  const dismissedFingerprints = useMemo(() => {
    if (!settings) return new Set<string>();
    return new Set(settings.healthDismissedFindings.map((d) => `${d.scannerId}|${d.fingerprint}`));
  }, [settings]);

  const allFindings = scanResult?.findings ?? [];
  const liveFindings = useMemo(
    () =>
      allFindings.filter(
        (f) => !dismissedFingerprints.has(`${f.scannerId}|${fingerprintForFinding(f)}`),
      ),
    [allFindings, dismissedFingerprints],
  );
  const dismissedFindings = useMemo(
    () =>
      allFindings.filter((f) =>
        dismissedFingerprints.has(`${f.scannerId}|${fingerprintForFinding(f)}`),
      ),
    [allFindings, dismissedFingerprints],
  );

  const stubFindings = useMemo(() => liveFindings.filter(isStubFinding), [liveFindings]);
  const dupFindings = useMemo(() => liveFindings.filter(isDupFinding), [liveFindings]);

  const visibleFindings = useMemo(() => {
    if (activeTab === "stubs") return stubFindings;
    if (activeTab === "duplicates") return dupFindings;
    return dismissedFindings;
  }, [activeTab, stubFindings, dupFindings, dismissedFindings]);

  const activeFinding = useMemo<HealthFinding | null>(() => {
    if (!activeFindingId) return null;
    return allFindings.find((f) => f.id === activeFindingId) ?? null;
  }, [activeFindingId, allFindings]);

  const bookmarksById = useMemo(() => {
    const map = new Map<string, Bookmark>();
    if (loadedCtx) {
      for (const b of loadedCtx.bookmarks) map.set(b.id, b);
    }
    return map;
  }, [loadedCtx]);

  const mappingsByBookmarkId = useMemo(() => {
    const map = new Map<string, ChromeMapping[]>();
    if (loadedCtx) {
      for (const m of loadedCtx.mappings) {
        if (m.bookmarkId === null) continue;
        const list = map.get(m.bookmarkId);
        if (list) list.push(m);
        else map.set(m.bookmarkId, [m]);
      }
    }
    return map;
  }, [loadedCtx]);

  // -- open / dismiss / apply --
  const openFinding = useCallback((finding: HealthFinding) => {
    setActiveFindingId(finding.id);
    setReviewed((prev) => {
      if (prev.has(finding.id)) return prev;
      const next = new Set(prev);
      next.add(finding.id);
      return next;
    });
  }, []);

  const dismissFinding = useCallback(
    async (finding: HealthFinding) => {
      if (!settings) return;
      const fingerprint = fingerprintForFinding(finding);
      const next = await setSettings({
        healthDismissedFindings: [
          ...settings.healthDismissedFindings.filter(
            (d) => !(d.scannerId === finding.scannerId && d.fingerprint === fingerprint),
          ),
          { scannerId: finding.scannerId, fingerprint, dismissedAt: Date.now() },
        ],
      });
      setLocalSettings(next);
      if (activeFindingId === finding.id) setActiveFindingId(null);
    },
    [settings, activeFindingId],
  );

  const restoreDismissal = useCallback(
    async (finding: HealthFinding) => {
      if (!settings) return;
      const fingerprint = fingerprintForFinding(finding);
      const next = await setSettings({
        healthDismissedFindings: settings.healthDismissedFindings.filter(
          (d) => !(d.scannerId === finding.scannerId && d.fingerprint === fingerprint),
        ),
      });
      setLocalSettings(next);
    },
    [settings],
  );

  const applyAction = useCallback(
    async (action: HealthAction) => {
      try {
        await applyFinding(action);
        setActiveFindingId(null);
        setStatusMessage("Applied. 30s to undo.");
        if (settings) {
          // Re-run scan to refresh findings (cheap — all in-memory).
          const ctx = await reloadCorpus();
          const result = await runHealthScan({
            bookmarks: ctx.bookmarks,
            settings,
            mappings: ctx.mappings,
            tags: ctx.tags,
          });
          setScanResult(result);
        }
      } catch (err) {
        console.error("[health] apply failed", err);
        setStatusMessage(`apply failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [reloadCorpus, settings],
  );

  const handleUndo = useCallback(
    async (snap: UndoSnapshot) => {
      try {
        await undoSnapshot(snap.id);
        setStatusMessage("Undone (local only — Chrome side not restored).");
        if (settings) {
          const ctx = await reloadCorpus();
          const result = await runHealthScan({
            bookmarks: ctx.bookmarks,
            settings,
            mappings: ctx.mappings,
            tags: ctx.tags,
          });
          setScanResult(result);
        }
      } catch (err) {
        console.error("[health] undo failed", err);
        setStatusMessage(`undo failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [reloadCorpus, settings],
  );

  // -- scanner toggle --
  const toggleScanner = useCallback(
    async (id: string, enabled: boolean) => {
      if (!settings) return;
      const next = await setSettings({
        healthEnabledScanners: { ...settings.healthEnabledScanners, [id]: enabled },
      });
      setLocalSettings(next);
    },
    [settings],
  );

  const toggleBrokenLinkFlag = useCallback(
    async (v: boolean) => {
      if (!settings) return;
      const next = await setSettings({ healthBrokenLinkCheckEnabled: v });
      setLocalSettings(next);
    },
    [settings],
  );

  // -- bulk accept --
  const visibleLiveFindings = activeTab === "dismissed" ? [] : visibleFindings;
  const allVisibleReviewed = useMemo(() => {
    if (visibleLiveFindings.length === 0) return false;
    return visibleLiveFindings.every((f) => reviewed.has(f.id));
  }, [visibleLiveFindings, reviewed]);

  // Bulk dialog 3s countdown — re-arm each open.
  useEffect(() => {
    if (!bulkDialogOpen) return;
    setBulkSecondsLeft(3);
    const handle = setInterval(() => {
      setBulkSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(handle);
  }, [bulkDialogOpen]);

  const runBulkAccept = useCallback(async () => {
    setBulkDialogOpen(false);
    for (const f of visibleLiveFindings) {
      if (!f.suggestedAction) continue;
      try {
        await applyFinding(f.suggestedAction);
      } catch (err) {
        console.error("[health] bulk apply failed for", f.id, err);
      }
    }
    setStatusMessage(`Bulk-accepted ${visibleLiveFindings.length} findings.`);
    if (settings) {
      const ctx = await reloadCorpus();
      const result = await runHealthScan({
        bookmarks: ctx.bookmarks,
        settings,
        mappings: ctx.mappings,
        tags: ctx.tags,
      });
      setScanResult(result);
    }
  }, [visibleLiveFindings, settings, reloadCorpus]);

  if (!settings) {
    return (
      <div className="mx-auto max-w-[960px] p-6">
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[960px] p-4 sm:p-8">
      <header className="mb-4 flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={backToOverview} aria-label="back to overview">
          <ChevronLeft />
        </Button>
        <div className="flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <HeartPulse className="size-6 text-rose-500" /> Bookmark Health
          </h1>
          <p className="text-sm text-muted-foreground">
            One-shot scan over your library. Suggestions only — accept each one explicitly.
          </p>
        </div>
      </header>

      <Section title="Scanners">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {scanners.map((s) => {
            const stats = scanResult?.scannerStats[s.id];
            return (
              <ScannerToggleRow
                key={s.id}
                scanner={s}
                enabled={scannerEnabledFor(s, settings)}
                onToggle={(v) => void toggleScanner(s.id, v)}
                lastCount={stats?.count}
                lastDurationMs={stats?.durationMs}
              />
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button onClick={() => void runScan()} disabled={scanning}>
            {scanning ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {scanResult ? "Run scan again" : "Run scan"}
          </Button>
          <Button
            variant="outline"
            onClick={() => void runBrokenLinkSweep()}
            disabled={scanning || !settings.healthBrokenLinkCheckEnabled}
            title="Re-run the existing dead-link sweep, then re-scan"
          >
            Scan broken links
          </Button>
          <label className="ml-2 inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={settings.healthBrokenLinkCheckEnabled}
              onChange={(e) => void toggleBrokenLinkFlag(e.target.checked)}
              className="size-4 accent-primary"
            />
            Enable broken-link findings (reads bm.linkCheck only)
          </label>
          {scanResult && (
            <span className="ml-auto text-xs text-muted-foreground">
              last run {new Date(scanResult.finishedAt).toLocaleTimeString()} ·{" "}
              {scanResult.totalScanned} scanned · {scanResult.findings.length} findings ·{" "}
              {scanResult.finishedAt - scanResult.startedAt}ms
            </span>
          )}
          {statusMessage && <span className="text-xs text-muted-foreground">{statusMessage}</span>}
        </div>
      </Section>

      <Section title={`Findings (${liveFindings.length})`}>
        <Tabs
          tabs={[
            { id: "stubs", label: `Stubs & anomalies (${stubFindings.length})` },
            { id: "duplicates", label: `Soft duplicates (${dupFindings.length})` },
            { id: "dismissed", label: `Dismissed (${dismissedFindings.length})` },
          ]}
          value={activeTab}
          onChange={setActiveTab}
        />

        {activeTab !== "dismissed" && (
          <div className="mt-2 flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!allVisibleReviewed || visibleLiveFindings.length === 0}
              onClick={() => setBulkDialogOpen(true)}
              title={
                allVisibleReviewed
                  ? "Bulk-apply the suggested action for every finding in this tab"
                  : "Open every finding once to enable bulk-accept"
              }
            >
              <CheckCheck /> Accept all reviewed ({reviewed.size} / {visibleLiveFindings.length})
            </Button>
          </div>
        )}

        <div className="mt-3 flex flex-col gap-2">
          {visibleFindings.length === 0 && (
            <p className="rounded-md border border-dashed bg-card/50 p-6 text-center text-sm text-muted-foreground">
              {scanResult
                ? activeTab === "dismissed"
                  ? "No dismissed findings."
                  : "Nothing to clean up in this tab — nice."
                : "Run a scan to see findings."}
            </p>
          )}
          {visibleFindings.map((f) => {
            const bookmarks = f.bookmarkIds
              .map((id) => bookmarksById.get(id))
              .filter((b): b is Bookmark => b !== undefined);
            return (
              <FindingCard
                key={f.id}
                finding={f}
                bookmarks={bookmarks}
                reviewed={reviewed.has(f.id)}
                onOpen={() => {
                  if (activeTab === "dismissed") {
                    void restoreDismissal(f);
                  } else {
                    openFinding(f);
                  }
                }}
                onDismiss={() => {
                  if (activeTab === "dismissed") {
                    void restoreDismissal(f);
                  } else {
                    void dismissFinding(f);
                  }
                }}
              />
            );
          })}
        </div>
      </Section>

      {/* Review sheet */}
      <Sheet
        open={activeFinding !== null}
        onOpenChange={(o) => {
          if (!o) setActiveFindingId(null);
        }}
      >
        <SheetContent side="right" className="w-full max-w-[100vw] p-0 sm:max-w-[820px]">
          <SheetTitle className="sr-only">Review finding</SheetTitle>
          <SheetDescription className="sr-only">
            Inspect this finding and apply or dismiss the suggested fix.
          </SheetDescription>
          {activeFinding && loadedCtx && (
            <FindingReviewSheet
              finding={activeFinding}
              bookmarks={activeFinding.bookmarkIds
                .map((id) => bookmarksById.get(id))
                .filter((b): b is Bookmark => b !== undefined)}
              mappingsByBookmarkId={mappingsByBookmarkId}
              folderTitleByChromeId={loadedCtx.folderTitleByChromeId}
              syncEnabled={settings.syncEnabled}
              onApply={applyAction}
              onDismiss={() => {
                if (activeFinding) void dismissFinding(activeFinding);
              }}
              onOpenInEditor={openOverviewEdit}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Bulk-accept confirmation */}
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk-accept {visibleLiveFindings.length} findings?</DialogTitle>
            <DialogDescription>
              The suggested action for every finding in this tab will run. Findings without a
              suggested action are skipped. You'll get a 30s undo for each one.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="default"
              disabled={bulkSecondsLeft > 0}
              onClick={() => void runBulkAccept()}
            >
              {bulkSecondsLeft > 0 ? `Confirm in ${bulkSecondsLeft}s` : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Undo toast stack */}
      {undoSnapshots.length > 0 && (
        <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
          {undoSnapshots.map((snap) => (
            <UndoToast
              key={snap.id}
              snapshot={snap}
              caveat={
                settings.syncEnabled
                  ? "Local restore only — Chrome bookmarks already removed."
                  : undefined
              }
              onUndo={() => void handleUndo(snap)}
              onDismiss={() => {
                undoBuffer.pop(snap.id);
                setUndoSnapshots(undoBuffer.list());
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 text-lg font-medium">{title}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: ReadonlyArray<{ id: T; label: string }>;
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div role="tablist" className="flex flex-wrap gap-1 border-b">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "rounded-t-md px-3 py-1.5 text-sm font-medium transition-colors",
            value === t.id
              ? "border-b-2 border-primary text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
