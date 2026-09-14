/**
 * Options / settings page.
 */

import { BookOpen, CloudUpload, Keyboard, Upload } from "lucide-react";
import type * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ShortcutHelp } from "@/components/ShortcutHelp";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { runBackupOnce } from "@/core/backup";
import { importGoodreadsHtml, importRawUrls } from "@/core/importExport";
import { countBookmarks } from "@/core/storage/bookmarks";
import { getDB } from "@/core/storage/db";
import { getSettings, setSettings } from "@/core/storage/settings";
import { useShortcutHelp } from "@/hooks/useShortcutHelp";
import { isTypingTarget } from "@/shared/shortcuts";
import type { ConflictPolicy, FolderMirrorPolicy, ReadStatus, Settings } from "@/shared/types";
import { DEFAULT_SETTINGS } from "@/shared/types";

const CONFLICT_POLICIES: ReadonlyArray<{ value: ConflictPolicy; label: string; help: string }> = [
  {
    value: "prefer-newer",
    label: "prefer-newer",
    help: "Whichever side's timestamp is more recent wins on title/url conflicts. Default.",
  },
  {
    value: "prefer-chrome",
    label: "prefer-chrome",
    help: "Chrome always wins for url/title. Quietest, but ignores edits made in this extension if a Chrome change follows.",
  },
  {
    value: "prefer-store",
    label: "prefer-store",
    help: "This extension's value always wins. Chrome-side title/url edits will be reverted on next sync.",
  },
  {
    value: "ask",
    label: "ask",
    help: "Surface a prompt on every conflict. Noisy.",
  },
];

const FOLDER_MIRROR: ReadonlyArray<{ value: FolderMirrorPolicy; label: string; help: string }> = [
  {
    value: "off",
    label: "off",
    help: "Tags do not project into Chrome folders unless you opt in per-tag.",
  },
  {
    value: "all",
    label: "all",
    help: "Every tag auto-mirrors as a Chrome folder. Fills your bookmarks bar; only flip this on with intent.",
  },
];

const STATUS_OPTIONS: ReadonlyArray<ReadStatus> = ["unread", "reading", "read", "archived"];

type Stats = {
  bookmarks: number;
  tags: number;
  edges: number;
  postings: number;
  mappings: number;
};

export const Options = () => {
  const [settings, setLocalSettings] = useState<Settings | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [backupStatus, setBackupStatus] = useState<string>("");
  const [extraStrippedDraft, setExtraStrippedDraft] = useState("");
  const [rawUrlsDraft, setRawUrlsDraft] = useState<string>("");
  const [rawUrlsBusy, setRawUrlsBusy] = useState<boolean>(false);
  const [rawUrlsStatus, setRawUrlsStatus] = useState<string>("");
  const rawUrlsFileInput = useRef<HTMLInputElement>(null);
  const [goodreadsStatus, setGoodreadsStatus] = useState<string>("");
  const goodreadsInputRef = useRef<HTMLInputElement | null>(null);
  const { open: shortcutHelpOpen, setOpen: setShortcutHelpOpen } = useShortcutHelp();

  useEffect(() => {
    (async () => {
      const s = await getSettings();
      setLocalSettings(s);
      setExtraStrippedDraft(s.canonicalizationOverrides.extraStrippedParams.join(", "));
    })();
  }, []);

  const refreshStats = useCallback(async () => {
    const db = getDB();
    const [bookmarks, tags, edges, postings, mappings] = await Promise.all([
      countBookmarks(),
      db.tags.count(),
      db.edges.count(),
      db.postings.count(),
      db.chromeMappings.count(),
    ]);
    setStats({ bookmarks, tags, edges, postings, mappings });
  }, []);

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  // `/` focuses the first search input on the settings page. Options
  // has no primary search box yet — the handler still hunts for one so
  // any surface-level search added later ("filter settings", "find in
  // URL list") picks the shortcut up without extra wiring. Falls back
  // to focusing the first search-labelled input, or the first Input on
  // the page if none is found.
  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      if (ev.key !== "/") return;
      if (isTypingTarget(ev.target)) return;
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const search =
        document.querySelector<HTMLInputElement>(
          'input[type="search"], input[aria-label*="search" i], input[placeholder*="search" i]',
        ) ?? null;
      if (!search) return;
      ev.preventDefault();
      search.focus();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // All useCallbacks live above the `if (!settings)` early return so
  // the hook count stays stable between the loading and loaded renders
  // (React's Rules of Hooks — anything conditional after this point
  // would trip "Rendered more hooks than during the previous render.").
  const runRawUrlImport = useCallback(
    async (text: string, source: string) => {
      const trimmed = text.trim();
      if (trimmed.length === 0) {
        setRawUrlsStatus("nothing to import — paste URLs or choose a file");
        return;
      }
      setRawUrlsBusy(true);
      setRawUrlsStatus(`importing ${source}…`);
      try {
        const report = await importRawUrls(trimmed);
        const parts = [`${report.imported} new`, `${report.merged} merged`];
        if (report.rejected > 0) parts.push(`${report.rejected} skipped`);
        setRawUrlsStatus(`imported ${source}: ${parts.join(", ")}`);
        // Refresh the store counts card so the new totals show up
        // without a manual reload.
        await refreshStats();
      } catch (err) {
        setRawUrlsStatus(`import failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setRawUrlsBusy(false);
      }
    },
    [refreshStats],
  );

  const handleRawUrlTextImport = useCallback(async () => {
    await runRawUrlImport(rawUrlsDraft, "pasted list");
    // Only clear the textarea when the import ran through (i.e. the
    // input wasn't empty to begin with).
    if (rawUrlsDraft.trim().length > 0) setRawUrlsDraft("");
  }, [rawUrlsDraft, runRawUrlImport]);

  const handleRawUrlFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      await runRawUrlImport(text, file.name);
      if (rawUrlsFileInput.current) rawUrlsFileInput.current.value = "";
    },
    [runRawUrlImport],
  );

  if (!settings) {
    return (
      <div className="p-6">
        <p>Loading…</p>
        <ShortcutHelp open={shortcutHelpOpen} onOpenChange={setShortcutHelpOpen} />
      </div>
    );
  }

  const update = async (patch: Partial<Settings>) => {
    const next = await setSettings(patch);
    setLocalSettings(next);
    setSavedAt(Date.now());
  };

  const handleExtraStrippedBlur = async () => {
    const params = extraStrippedDraft
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    await update({
      canonicalizationOverrides: {
        ...settings.canonicalizationOverrides,
        extraStrippedParams: params,
      },
    });
  };

  const handleBackupNow = async () => {
    setBackupStatus("backing up…");
    try {
      const { fileName, byteSize } = await runBackupOnce();
      setBackupStatus(`saved ${fileName} (${formatBytes(byteSize)})`);
    } catch (err) {
      setBackupStatus(`failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleGoodreadsImportClick = () => {
    goodreadsInputRef.current?.click();
  };

  const handleGoodreadsFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setGoodreadsStatus(`importing ${file.name}…`);
    try {
      const text = await file.text();
      const report = await importGoodreadsHtml(text);
      setGoodreadsStatus(
        `Goodreads: ${report.imported} new, ${report.merged} merged, ${report.rejected} rejected`,
      );
      await refreshStats();
    } catch (err) {
      setGoodreadsStatus(`import failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (goodreadsInputRef.current) goodreadsInputRef.current.value = "";
    }
  };

  const handleReset = async () => {
    if (!confirm("Reset settings to defaults? Your bookmarks are not affected.")) return;
    await update(DEFAULT_SETTINGS);
    setExtraStrippedDraft("");
  };

  return (
    <div className="mx-auto max-w-[760px] p-4 sm:p-8">
      <div className="mb-1 flex items-center gap-2">
        <h1 className="flex-1 text-2xl font-semibold">Settings</h1>
        <Button
          variant="ghost"
          size="icon"
          aria-label="keyboard shortcuts"
          title="Keyboard shortcuts (?)"
          onClick={() => setShortcutHelpOpen(true)}
        >
          <Keyboard />
        </Button>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        All changes save automatically. Settings live in chrome.storage.local; bookmark data lives
        in IndexedDB.
      </p>

      {stats && (
        <div className="mt-4 rounded-md border bg-card p-3">
          <p className="mb-2 text-sm font-medium">Local store</p>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline">{stats.bookmarks} bookmarks</Badge>
            <Badge variant="outline">{stats.tags} tags</Badge>
            <Badge variant="outline">{stats.edges} edges</Badge>
            <Badge variant="outline">{stats.postings} search postings</Badge>
            <Badge variant="outline">{stats.mappings} Chrome mappings</Badge>
          </div>
        </div>
      )}

      <Separator className="my-6" />

      <Section title="Sync">
        <div className="flex items-center gap-2">
          <Switch
            id="syncEnabled"
            checked={settings.syncEnabled}
            onCheckedChange={(v) => update({ syncEnabled: v })}
          />
          <Label htmlFor="syncEnabled">Sync with chrome.bookmarks (both directions)</Label>
        </div>
        <SelectField
          label="Conflict policy"
          value={settings.conflictPolicy}
          onChange={(v) => update({ conflictPolicy: v as ConflictPolicy })}
          options={CONFLICT_POLICIES}
        />
        <SelectField
          label="Folder mirror policy"
          value={settings.folderMirrorPolicy}
          onChange={(v) => update({ folderMirrorPolicy: v as FolderMirrorPolicy })}
          options={FOLDER_MIRROR}
        />
      </Section>

      <Section title="Capture defaults">
        <div className="grid grid-cols-3 gap-2">
          <NumberField
            id="defaultRating"
            label="Default rating"
            min={0}
            max={10}
            value={settings.defaultRating}
            onChange={(n) => update({ defaultRating: n })}
          />
          <NumberField
            id="defaultTime"
            label="Default time (min)"
            min={0}
            value={settings.defaultNecessaryTime}
            onChange={(n) => update({ defaultNecessaryTime: n })}
          />
          <div className="flex flex-col gap-1.5">
            <Label>Default status</Label>
            <Select
              value={settings.defaultStatus}
              onValueChange={(v) => update({ defaultStatus: v as ReadStatus })}
            >
              <SelectTrigger aria-label="Default status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Section>

      <Section title="URL canonicalization">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="extraStripped">
            Extra tracking params to strip (comma- or space-separated)
          </Label>
          <Input
            id="extraStripped"
            value={extraStrippedDraft}
            onChange={(e) => setExtraStrippedDraft(e.target.value)}
            onBlur={handleExtraStrippedBlur}
            placeholder="e.g. ck_subscriber_id, custom_ref"
          />
          <p className="text-xs text-muted-foreground">
            In addition to the shipped tracking-param blacklist (utm_*, fbclid, gclid, …).
          </p>
        </div>
        <div className="flex items-start gap-2">
          <Switch
            id="keepWikipediaFragments"
            checked={settings.keepWikipediaFragments}
            onCheckedChange={(v) => update({ keepWikipediaFragments: v })}
          />
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="keepWikipediaFragments">Keep Wikipedia section fragments</Label>
            <p className="text-xs text-muted-foreground">
              Off (default): the same Wikipedia page bookmarked at two different sections collapses
              to one record. On: each
              <code className="mx-1">#section</code> becomes its own canonical URL.
            </p>
          </div>
        </div>
      </Section>

      <Section title="Import URL list">
        <p className="text-sm text-muted-foreground">
          Paste a plain list of URLs (one per line) or upload a<code className="mx-1">.txt</code> /{" "}
          <code className="mx-1">.urls</code> file. Lines beginning with <code>#</code> are treated
          as comments; blank lines are ignored. Titles are not read from the file — enrichment (if
          enabled) fetches them later.
        </p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rawUrlsTextarea">URLs</Label>
          <Textarea
            id="rawUrlsTextarea"
            value={rawUrlsDraft}
            onChange={(e) => setRawUrlsDraft(e.target.value)}
            placeholder={"# my reading list\nhttps://example.com/one\nhttps://example.com/two"}
            rows={8}
            disabled={rawUrlsBusy}
            spellCheck={false}
            aria-label="URLs to import, one per line"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={handleRawUrlTextImport}
            disabled={rawUrlsBusy || rawUrlsDraft.trim().length === 0}
          >
            <Upload /> Import pasted list
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => rawUrlsFileInput.current?.click()}
            disabled={rawUrlsBusy}
          >
            <Upload /> Upload file…
          </Button>
          <input
            ref={rawUrlsFileInput}
            type="file"
            accept=".txt,.urls,text/plain"
            className="hidden"
            aria-label="upload URL list file"
            aria-hidden="true"
            tabIndex={-1}
            onChange={handleRawUrlFileChange}
          />
          {rawUrlsStatus && (
            <span className="text-xs text-muted-foreground" role="status" aria-live="polite">
              {rawUrlsStatus}
            </span>
          )}
        </div>
      </Section>

      <Section title="Enrichment (network)">
        <div className="flex items-start gap-2">
          <Switch
            id="networkEnrichmentEnabled"
            checked={settings.networkEnrichmentEnabled}
            onCheckedChange={(v) => update({ networkEnrichmentEnabled: v })}
          />
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="networkEnrichmentEnabled">
              Fetch page metadata (title, description, reading time)
            </Label>
            <p className="text-xs text-muted-foreground">
              Off by default. When on, a background sweep visits pages that lack a fetched title,
              description, language, or reading-time estimate and fills the blanks. Never overwrites
              fields you filled in yourself.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Switch
            id="pageSnapshotEnabled"
            checked={settings.pageSnapshotEnabled}
            disabled={!settings.networkEnrichmentEnabled}
            onCheckedChange={(v) => update({ pageSnapshotEnabled: v })}
          />
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="pageSnapshotEnabled">
              Save a readable-text snapshot of each fetched page
            </Label>
            <p className="text-xs text-muted-foreground">
              Requires the network-enrichment toggle above. Stores up to 500 KB of extracted article
              text per bookmark, keyed by bookmark id. Used later as fuel for full-text search; the
              snapshot is deleted when you delete the bookmark.
            </p>
          </div>
        </div>
      </Section>

      <Section title="Auto-backup">
        <div className="flex items-center gap-2">
          <Switch
            id="autoBackupEnabled"
            checked={settings.autoBackupEnabled}
            onCheckedChange={(v) => update({ autoBackupEnabled: v })}
          />
          <Label htmlFor="autoBackupEnabled">Periodic JSON snapshot to ~/Downloads</Label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            id="autoBackupIntervalMin"
            label="Interval (minutes)"
            min={5}
            value={settings.autoBackupIntervalMin}
            disabled={!settings.autoBackupEnabled}
            onChange={(n) => update({ autoBackupIntervalMin: Math.max(5, n) })}
            help="Default 1440 = once a day."
          />
          <NumberField
            id="autoBackupKeepCount"
            label="Keep N most recent"
            min={1}
            value={settings.autoBackupKeepCount}
            disabled={!settings.autoBackupEnabled}
            onChange={(n) => update({ autoBackupKeepCount: Math.max(1, n) })}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleBackupNow}>
            <CloudUpload /> Back up now
          </Button>
          {backupStatus && <span className="text-xs text-muted-foreground">{backupStatus}</span>}
        </div>
      </Section>

      <Section title="Import Goodreads library">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleGoodreadsImportClick}
              aria-label="Import Goodreads Library HTML"
            >
              <BookOpen /> Import Goodreads Library HTML
            </Button>
            {goodreadsStatus && (
              <span className="text-xs text-muted-foreground">{goodreadsStatus}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Point this at a saved Goodreads "My Books" page. One row per book: the title, the book's
            Goodreads page, star rating (mapped 1-5 → 2-10 here), shelves as tags, and your review
            as the note.
          </p>
          {/* Hidden native input so the button owns keyboard focus + label. */}
          <input
            ref={goodreadsInputRef}
            type="file"
            accept=".html,.htm,text/html"
            aria-hidden="true"
            tabIndex={-1}
            className="hidden"
            onChange={handleGoodreadsFileChange}
          />
        </div>
      </Section>

      <Separator className="my-6" />

      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={handleReset} className="text-destructive">
          Reset to defaults
        </Button>
        <div className="flex-1" />
        {savedAt && (
          <span className="text-xs text-muted-foreground">
            saved {new Date(savedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      <ShortcutHelp open={shortcutHelpOpen} onOpenChange={setShortcutHelpOpen} />
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

type SelectOpt<T extends string> = { value: T; label: string; help?: string };

function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<SelectOpt<T>>;
}) {
  const opt = options.find((o) => o.value === value);
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {opt?.help && <p className="text-xs text-muted-foreground">{opt.help}</p>}
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  disabled,
  help,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  help?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
