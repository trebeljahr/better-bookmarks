/**
 * Options / settings page.
 *
 * Drives chrome.storage.local-backed Settings via core/storage/settings.ts.
 * Shows live stats from the local Dexie store at the top so the user can
 * sanity-check the data layer alongside their preferences.
 */

import BackupIcon from "@mui/icons-material/Backup";
import {
  Box,
  Button,
  Chip,
  Divider,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import type * as React from "react";
import { useCallback, useEffect, useState } from "react";
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
      <Box sx={{ p: 4 }}>
        <Typography>Loading…</Typography>
      </Box>
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
    <Box sx={{ maxWidth: 760, mx: "auto", p: { xs: 2, sm: 4 } }}>
      <Typography variant="h4" gutterBottom>
        Settings
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        All changes save automatically. Settings live in chrome.storage.local; bookmark data lives
        in IndexedDB.
      </Typography>

      {stats && (
        <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Local store
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Chip size="small" variant="outlined" label={`${stats.bookmarks} bookmarks`} />
            <Chip size="small" variant="outlined" label={`${stats.tags} tags`} />
            <Chip size="small" variant="outlined" label={`${stats.edges} edges`} />
            <Chip size="small" variant="outlined" label={`${stats.postings} search postings`} />
            <Chip size="small" variant="outlined" label={`${stats.mappings} Chrome mappings`} />
          </Stack>
        </Paper>
      )}

      <Divider sx={{ my: 3 }} />

      <Section title="Sync">
        <FormControlLabel
          control={
            <Switch
              checked={settings.syncEnabled}
              onChange={(_, v) => update({ syncEnabled: v })}
            />
          }
          label="Sync with chrome.bookmarks (both directions)"
        />
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
        <Stack direction="row" spacing={2}>
          <TextField
            label="Default rating"
            type="number"
            inputProps={{ min: 0, max: 10 }}
            value={settings.defaultRating}
            onChange={(e) => update({ defaultRating: Number(e.target.value) })}
            sx={{ flex: 1 }}
          />
          <TextField
            label="Default time (min)"
            type="number"
            inputProps={{ min: 0 }}
            value={settings.defaultNecessaryTime}
            onChange={(e) => update({ defaultNecessaryTime: Number(e.target.value) })}
            sx={{ flex: 1 }}
          />
          <TextField
            select
            label="Default status"
            value={settings.defaultStatus}
            onChange={(e) => update({ defaultStatus: e.target.value as ReadStatus })}
            sx={{ flex: 1 }}
          >
            {STATUS_OPTIONS.map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </Section>

      <Section title="URL canonicalization">
        <TextField
          fullWidth
          label="Extra tracking params to strip (comma- or space-separated)"
          value={extraStrippedDraft}
          onChange={(e) => setExtraStrippedDraft(e.target.value)}
          onBlur={handleExtraStrippedBlur}
          placeholder="e.g. ck_subscriber_id, custom_ref"
          helperText="In addition to the shipped tracking-param blacklist (utm_*, fbclid, gclid, ...)."
        />
      </Section>

      <Section title="Auto-backup">
        <FormControlLabel
          control={
            <Switch
              checked={settings.autoBackupEnabled}
              onChange={(_, v) => update({ autoBackupEnabled: v })}
            />
          }
          label="Periodic JSON snapshot to ~/Downloads"
        />
        <Stack direction="row" spacing={2}>
          <TextField
            label="Interval (minutes)"
            type="number"
            inputProps={{ min: 5 }}
            value={settings.autoBackupIntervalMin}
            onChange={(e) => update({ autoBackupIntervalMin: Math.max(5, Number(e.target.value)) })}
            sx={{ flex: 1 }}
            disabled={!settings.autoBackupEnabled}
            helperText="Default 1440 = once a day."
          />
          <TextField
            label="Keep N most recent"
            type="number"
            inputProps={{ min: 1 }}
            value={settings.autoBackupKeepCount}
            onChange={(e) => update({ autoBackupKeepCount: Math.max(1, Number(e.target.value)) })}
            sx={{ flex: 1 }}
            disabled={!settings.autoBackupEnabled}
          />
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center">
          <Button variant="outlined" startIcon={<BackupIcon />} onClick={handleBackupNow}>
            Back up now
          </Button>
          {backupStatus && (
            <Typography variant="caption" color="text.secondary">
              {backupStatus}
            </Typography>
          )}
        </Stack>
      </Section>

      <Divider sx={{ my: 3 }} />

      <Stack direction="row" spacing={1} alignItems="center">
        <Button variant="text" color="error" onClick={handleReset}>
          Reset to defaults
        </Button>
        <Box sx={{ flex: 1 }} />
        {savedAt && (
          <Typography variant="caption" color="text.secondary">
            saved {new Date(savedAt).toLocaleTimeString()}
          </Typography>
        )}
      </Stack>
    </Box>
  );
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box sx={{ mt: 3 }}>
      <Typography variant="h6" gutterBottom>
        {title}
      </Typography>
      <Stack spacing={2}>{children}</Stack>
    </Box>
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
    <TextField
      select
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      helperText={opt?.help}
      fullWidth
    >
      {options.map((o) => (
        <MenuItem key={o.value} value={o.value}>
          {o.label}
        </MenuItem>
      ))}
    </TextField>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
