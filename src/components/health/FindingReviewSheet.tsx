/**
 * Side-by-side review surface for a health finding.
 *
 * Two modes:
 *   - "stub" finding: inline editor for set-title / add-tag / open-detail
 *   - "soft-dup" finding: two BookmarkSummaryCards side-by-side, with
 *     survivor toggle, union-of-tags preview, Chrome-node summary,
 *     sync-off banner, and a Merge button.
 */
import { AlertTriangle, ExternalLink, Pencil } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { type HealthAction, type HealthFinding, mergeRecords } from "@/core/health";
import { cn } from "@/lib/utils";
import type { Bookmark, ChromeMapping } from "@/shared/types";

type Props = {
  finding: HealthFinding;
  /** Resolved Bookmark records for `finding.bookmarkIds`. */
  bookmarks: Bookmark[];
  /** Mapping rows keyed by bookmark id (only the losers' rows will be deleted). */
  mappingsByBookmarkId: Map<string, ChromeMapping[]>;
  /** Chrome folder titles keyed by chromeId, for "folder path" display. */
  folderTitleByChromeId: Map<string, string>;
  /** Whether bidirectional Chrome sync is currently enabled. */
  syncEnabled: boolean;
  onApply: (action: HealthAction) => void | Promise<void>;
  onDismiss: () => void;
  onOpenInEditor: (bookmarkId: string) => void;
};

function isDup(finding: HealthFinding): boolean {
  return finding.kind.startsWith("dup-");
}

export function FindingReviewSheet(props: Props) {
  if (isDup(props.finding)) {
    return <SoftDupReview {...props} />;
  }
  return <StubReview {...props} />;
}

// ---------- Soft-duplicate review ----------------------------------------

function SoftDupReview({
  finding,
  bookmarks,
  mappingsByBookmarkId,
  folderTitleByChromeId,
  syncEnabled,
  onApply,
  onDismiss,
  onOpenInEditor,
}: Props) {
  const [survivorId, setSurvivorId] = useState<string>(finding.primaryBookmarkId);
  const [syncOffAcknowledged, setSyncOffAcknowledged] = useState<boolean>(false);

  // Reset acknowledgement when finding changes (different merge to confirm).
  useEffect(() => {
    setSurvivorId(finding.primaryBookmarkId);
    setSyncOffAcknowledged(false);
  }, [finding.primaryBookmarkId]);

  const survivor = bookmarks.find((b) => b.id === survivorId) ?? null;
  const losers = bookmarks.filter((b) => b.id !== survivorId);

  // Preview the merge result so the user sees what the survivor will look like.
  const preview = useMemo<Bookmark | null>(() => {
    if (!survivor) return null;
    try {
      return mergeRecords(survivor, losers);
    } catch (err) {
      console.error("[health] mergeRecords preview failed", err);
      return survivor;
    }
  }, [survivor, losers]);

  const loserMappings = losers.flatMap((l) => mappingsByBookmarkId.get(l.id) ?? []);
  const ready = syncEnabled ? true : syncOffAcknowledged;

  const handleMerge = async () => {
    if (!survivor) return;
    if (!ready) return;
    await onApply({
      type: "merge-bookmarks",
      survivorId: survivor.id,
      loserIds: losers.map((l) => l.id),
    });
  };

  if (!survivor || !preview) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Some bookmarks in this finding are missing — they may have already been deleted.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="border-b p-4 sm:p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Soft duplicate · {finding.kind}
        </p>
        <h2 className="mt-1 text-lg font-semibold">{finding.message}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick the survivor. Losers will be deleted from the local store
          {syncEnabled ? " and from Chrome bookmarks." : "."} 30s undo afterwards.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {bookmarks.map((b) => (
            <BookmarkSummaryCard
              key={b.id}
              bookmark={b}
              isSurvivor={b.id === survivorId}
              onSelect={() => setSurvivorId(b.id)}
              onOpenInEditor={() => onOpenInEditor(b.id)}
            />
          ))}
        </div>

        <Separator className="my-4" />

        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">What will happen if you merge</h3>
          <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Survivor title</dt>
            <dd className="font-medium">{preview.title || "(empty)"}</dd>

            <dt className="text-muted-foreground">Survivor URL</dt>
            <dd className="break-all text-xs text-muted-foreground">{preview.canonicalUrl}</dd>

            <dt className="text-muted-foreground">Tags after merge</dt>
            <dd className="flex flex-wrap gap-1">
              {preview.tags.length === 0 && <span className="text-muted-foreground">(none)</span>}
              {preview.tags.map((t) => (
                <Badge key={t} variant="outline" className="text-[10px]">
                  {t}
                </Badge>
              ))}
            </dd>

            <dt className="text-muted-foreground">Notes after merge</dt>
            <dd className="text-xs text-muted-foreground">
              {preview.note.trim().length === 0
                ? "(empty)"
                : `${preview.note.split("\n").length} lines, ${preview.note.length} chars`}
            </dd>

            <dt className="text-muted-foreground">Bookmarks deleted</dt>
            <dd>
              <Badge variant="outline">{losers.length}</Badge>
            </dd>

            <dt className="text-muted-foreground">Chrome nodes deleted</dt>
            <dd>
              {loserMappings.length === 0 ? (
                <span className="text-xs text-muted-foreground">none</span>
              ) : (
                <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                  {loserMappings.map((m) => (
                    <li key={m.chromeId} className="flex items-center gap-1.5">
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                        {m.chromeId}
                      </span>
                      <span className="truncate">
                        {resolveFolderPath(m, folderTitleByChromeId)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </dl>

          {!syncEnabled && (
            <SyncOffBanner
              acknowledged={syncOffAcknowledged}
              onAcknowledge={(v) => setSyncOffAcknowledged(v)}
              loserCount={losers.length}
            />
          )}
          {syncEnabled && (
            <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              Heads up: undo can restore the local records, but the Chrome nodes listed above are
              permanently removed from your Chrome bookmarks after merge — they can't be re-created
              from here.
            </p>
          )}
        </section>
      </div>

      <footer className="flex items-center gap-2 border-t p-4 sm:p-6">
        <Button variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
        <div className="flex-1" />
        <Button
          variant="default"
          disabled={!ready}
          onClick={handleMerge}
          aria-label="confirm merge"
        >
          Merge {losers.length + 1} → 1
        </Button>
      </footer>
    </div>
  );
}

function resolveFolderPath(mapping: ChromeMapping, titles: Map<string, string>): string {
  if (mapping.parentChromeId === null) return "(root)";
  const title = titles.get(mapping.parentChromeId);
  if (!title) return `parent ${mapping.parentChromeId}`;
  return title;
}

function BookmarkSummaryCard({
  bookmark,
  isSurvivor,
  onSelect,
  onOpenInEditor,
}: {
  bookmark: Bookmark;
  isSurvivor: boolean;
  onSelect: () => void;
  onOpenInEditor: () => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-md border bg-card p-3 transition-colors",
        isSurvivor && "border-primary ring-2 ring-primary/30",
      )}
    >
      <div className="flex items-center gap-1.5">
        {isSurvivor ? (
          <Badge variant="default" className="text-[10px]">
            survivor
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px]">
            will be deleted
          </Badge>
        )}
        <div className="flex-1" />
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="open in editor"
          onClick={onOpenInEditor}
        >
          <Pencil />
        </Button>
      </div>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={isSurvivor}
        aria-label={`select ${bookmark.title || bookmark.canonicalUrl} as survivor`}
        className="flex flex-col items-start gap-2 rounded-md text-left hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-primary"
      >
        <p className="line-clamp-2 text-sm font-medium">{bookmark.title || "(no title)"}</p>
        <p className="break-all text-xs text-muted-foreground">{bookmark.canonicalUrl}</p>
        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <span className="rounded bg-muted px-1.5 py-0.5">{bookmark.domain}</span>
          <span>·</span>
          <span>added {new Date(bookmark.createdAt).toLocaleDateString()}</span>
          {bookmark.rating !== null && (
            <>
              <span>·</span>
              <span>rated {bookmark.rating}</span>
            </>
          )}
        </div>
        {bookmark.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {bookmark.tags.map((t) => (
              <Badge key={t} variant="outline" className="text-[10px]">
                {t}
              </Badge>
            ))}
          </div>
        )}
      </button>
    </div>
  );
}

function SyncOffBanner({
  acknowledged,
  onAcknowledge,
  loserCount,
}: {
  acknowledged: boolean;
  onAcknowledge: (next: boolean) => void;
  loserCount: number;
}) {
  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-100">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="flex-1">
          <p className="font-medium">Chrome sync is off.</p>
          <p className="text-xs">
            We will only delete {loserCount} {loserCount === 1 ? "bookmark" : "bookmarks"} from the
            local store. The matching Chrome bookmark
            {loserCount === 1 ? "" : "s"} will remain in your browser — clean them up there
            separately.
          </p>
          <label className="mt-2 flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => onAcknowledge(e.target.checked)}
              className="size-4 cursor-pointer accent-amber-600"
            />
            I understand — proceed with local-only merge
          </label>
        </div>
      </div>
    </div>
  );
}

// ---------- Stub / anomaly review ----------------------------------------

function StubReview({ finding, bookmarks, onApply, onDismiss, onOpenInEditor }: Props) {
  const bookmark = bookmarks[0];
  if (!bookmark) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Bookmark missing — already removed?</div>
    );
  }
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="border-b p-4 sm:p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {finding.kind}
        </p>
        <h2 className="mt-1 text-lg font-semibold">{finding.message}</h2>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <BookmarkPreview bookmark={bookmark} />
        <Separator className="my-4" />
        <StubInlineEditor
          finding={finding}
          bookmark={bookmark}
          onApply={onApply}
          onOpenInEditor={() => onOpenInEditor(bookmark.id)}
        />
      </div>

      <footer className="flex items-center gap-2 border-t p-4 sm:p-6">
        <Button variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
        <div className="flex-1" />
        <Button variant="outline" onClick={() => onOpenInEditor(bookmark.id)}>
          <ExternalLink /> Open in editor
        </Button>
      </footer>
    </div>
  );
}

function BookmarkPreview({ bookmark }: { bookmark: Bookmark }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <p className="line-clamp-2 text-sm font-medium">{bookmark.title || "(no title)"}</p>
      <p className="break-all text-xs text-muted-foreground">{bookmark.canonicalUrl}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <span className="rounded bg-muted px-1.5 py-0.5">{bookmark.domain}</span>
        {bookmark.tags.map((t) => (
          <Badge key={t} variant="outline" className="text-[10px]">
            {t}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function StubInlineEditor({
  finding,
  bookmark,
  onApply,
  onOpenInEditor,
}: {
  finding: HealthFinding;
  bookmark: Bookmark;
  onApply: (action: HealthAction) => void | Promise<void>;
  onOpenInEditor: () => void;
}) {
  const [titleDraft, setTitleDraft] = useState<string>(() => suggestedTitle(bookmark));
  const [tagDraft, setTagDraft] = useState<string>("");

  if (finding.kind === "stub-empty-title" || finding.kind === "stub-generic-title") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = titleDraft.trim();
          if (!trimmed) return;
          void onApply({ type: "set-title", bookmarkId: bookmark.id, newTitle: trimmed });
        }}
        className="flex flex-col gap-2"
      >
        <Label htmlFor="stub-title">New title</Label>
        <Input
          id="stub-title"
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          placeholder="A descriptive title…"
          autoFocus
        />
        <div className="flex gap-2">
          <Button type="submit" disabled={!titleDraft.trim()}>
            Apply title
          </Button>
          <Button type="button" variant="outline" onClick={onOpenInEditor}>
            <ExternalLink /> Edit full record
          </Button>
        </div>
      </form>
    );
  }

  if (finding.kind === "stub-no-tags") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = tagDraft.trim();
          if (!trimmed) return;
          void onApply({ type: "add-tag", bookmarkId: bookmark.id, tag: trimmed });
        }}
        className="flex flex-col gap-2"
      >
        <Label htmlFor="stub-tag">Add a tag</Label>
        <Input
          id="stub-tag"
          value={tagDraft}
          onChange={(e) => setTagDraft(e.target.value)}
          placeholder="learning, work, …"
          autoFocus
        />
        <div className="flex gap-2">
          <Button type="submit" disabled={!tagDraft.trim()}>
            Add tag
          </Button>
          <Button type="button" variant="outline" onClick={onOpenInEditor}>
            <ExternalLink /> Edit full record
          </Button>
        </div>
      </form>
    );
  }

  if (finding.kind === "anomaly-tag-casing-collision") {
    const action = finding.suggestedAction;
    if (action?.type === "rename-tag") {
      return (
        <div className="flex flex-col gap-2 text-sm">
          <p>
            Rename tag <code className="rounded bg-muted px-1">{action.from}</code> →
            <code className="ml-1 rounded bg-muted px-1">{action.to}</code> across this and all
            sibling bookmarks.
          </p>
          <Button
            variant="default"
            onClick={() => void onApply({ type: "rename-tag", from: action.from, to: action.to })}
          >
            Apply rename
          </Button>
        </div>
      );
    }
  }

  if (finding.kind === "anomaly-broken-link") {
    return (
      <div className="flex flex-col gap-2 text-sm">
        <p>The dead-link sweep marked this URL as unreachable.</p>
        <Button
          variant="destructive"
          onClick={() => void onApply({ type: "delete-bookmark", bookmarkId: bookmark.id })}
        >
          Delete bookmark
        </Button>
      </div>
    );
  }

  // Default: just open the editor.
  return (
    <p className="text-sm text-muted-foreground">
      No one-click fix for this finding — open the editor to handle it.
    </p>
  );
}

function suggestedTitle(bookmark: Bookmark): string {
  // Empty / generic titles: suggest something the user is likely to edit
  // rather than leaving the input empty.
  const t = bookmark.title.trim();
  if (!t) return "";
  if (/^untitled$/i.test(t)) return "";
  if (/^\(no title\)$/i.test(t)) return "";
  return t;
}
