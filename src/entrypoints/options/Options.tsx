/**
 * Options / settings page.
 */

import { CloudUpload } from "lucide-react";
import type * as React from "react";
import { useCallback, useEffect, useState } from "react";
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
import { runBackupOnce } from "@/core/backup";
import { countBookmarks } from "@/core/storage/bookmarks";
import { getDB } from "@/core/storage/db";
import { getSettings, setSettings } from "@/core/storage/settings";
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

  if (!settings) {
    return (
      <div className="p-6">
        <p>Loading…</p>
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

  const handleReset = async () => {
    if (!confirm("Reset settings to defaults? Your bookmarks are not affected.")) return;
    await update(DEFAULT_SETTINGS);
    setExtraStrippedDraft("");
  };

  return (
    <div className="mx-auto max-w-[760px] p-4 sm:p-8">
      <h1 className="mb-1 text-2xl font-semibold">Settings</h1>
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
