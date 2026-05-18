/**
 * TagManager — manage every tag in the store: rename, merge, delete,
 * recolor, and re-parent.
 *
 * Renders inside a Drawer in the overview. The Tag schema carries
 * color, parentName, and description; this surface exposes the
 * destructive ops (rename + merge + delete) alongside the curation
 * ops (color + hierarchy).
 */

import CallMergeIcon from "@mui/icons-material/CallMerge";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  Popover,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMemo, useState } from "react";
import type { Tag } from "../shared/types";

type Props = {
  tags: Tag[];
  counts: Record<string, number>;
  onRename: (oldName: string, newName: string) => Promise<void>;
  onMerge: (from: string, into: string) => Promise<{ affected: number }>;
  onDelete: (name: string) => Promise<void>;
  onSetColor: (name: string, color: string | null) => Promise<void>;
  onSetParent: (name: string, parentName: string | null) => Promise<void>;
  onValidateParent?: (name: string, parentName: string) => Promise<{ ok: boolean; error?: string }>;
  onClose: () => void;
};

type Mode = { kind: "rename"; name: string; draft: string } | { kind: "merge"; from: string };

// Material-ish palette suggestions. Twelve named hues a user can
// pick at a glance, plus an explicit "clear" affordance.
const PRESET_COLORS: { hex: string; name: string }[] = [
  { hex: "#ef5350", name: "Red" },
  { hex: "#ec407a", name: "Pink" },
  { hex: "#ab47bc", name: "Purple" },
  { hex: "#7e57c2", name: "Deep Purple" },
  { hex: "#5c6bc0", name: "Indigo" },
  { hex: "#42a5f5", name: "Blue" },
  { hex: "#26c6da", name: "Cyan" },
  { hex: "#26a69a", name: "Teal" },
  { hex: "#66bb6a", name: "Green" },
  { hex: "#d4e157", name: "Lime" },
  { hex: "#ffca28", name: "Amber" },
  { hex: "#ff7043", name: "Deep Orange" },
];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function descendantNamesOf(rootName: string, tags: Tag[]): Set<string> {
  const childrenByParent = new Map<string, Tag[]>();
  for (const t of tags) {
    if (!t.parentName) continue;
    const key = t.parentName.toLowerCase();
    const list = childrenByParent.get(key);
    if (list) list.push(t);
    else childrenByParent.set(key, [t]);
  }
  const out = new Set<string>();
  const queue = [rootName.toLowerCase()];
  while (queue.length) {
    const cur = queue.shift();
    if (!cur) break;
    const kids = childrenByParent.get(cur) ?? [];
    for (const k of kids) {
      const kl = k.name.toLowerCase();
      if (out.has(kl)) continue;
      out.add(kl);
      queue.push(kl);
    }
  }
  return out;
}

function ancestorChainOf(name: string, tags: Tag[]): Tag[] {
  const byLower = new Map(tags.map((t) => [t.lowercaseName, t] as const));
  const start = byLower.get(name.toLowerCase());
  if (!start) return [];
  const seen = new Set<string>([start.lowercaseName]);
  const chain: Tag[] = [];
  let cursor: string | null = start.parentName;
  while (cursor !== null) {
    const cl = cursor.toLowerCase();
    if (seen.has(cl)) break;
    seen.add(cl);
    const parent = byLower.get(cl);
    if (!parent) break;
    chain.push(parent);
    cursor = parent.parentName;
  }
  return chain;
}

type ColorPickerProps = {
  current: string | null;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onPick: (color: string | null) => void;
};

function ColorPickerPopover({ current, anchorEl, onClose, onPick }: ColorPickerProps) {
  const [hex, setHex] = useState(current ?? "");
  const validHex = HEX_RE.test(hex);
  return (
    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
    >
      <Box sx={{ p: 2, width: 240 }}>
        <Typography variant="caption" color="text.secondary">
          Preset
        </Typography>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            gap: 1,
            mt: 1,
            mb: 2,
          }}
        >
          {PRESET_COLORS.map((c) => (
            <Box
              key={c.hex}
              role="button"
              tabIndex={0}
              aria-label={`Set color ${c.name}`}
              onClick={() => onPick(c.hex)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onPick(c.hex);
              }}
              sx={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                bgcolor: c.hex,
                cursor: "pointer",
                border: current?.toLowerCase() === c.hex.toLowerCase() ? 2 : 1,
                borderColor:
                  current?.toLowerCase() === c.hex.toLowerCase() ? "primary.main" : "divider",
              }}
            />
          ))}
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            size="small"
            label="Custom hex"
            placeholder="#a1b2c3"
            value={hex}
            onChange={(e) => setHex(e.target.value)}
            error={hex.length > 0 && !validHex}
            helperText={hex.length > 0 && !validHex ? "Expecting #rrggbb" : " "}
            sx={{ flex: 1 }}
          />
          <IconButton
            size="small"
            color="primary"
            disabled={!validHex}
            onClick={() => onPick(hex.toLowerCase())}
            aria-label="apply custom color"
          >
            <CheckIcon />
          </IconButton>
        </Stack>
        <Divider sx={{ my: 1 }} />
        <Button fullWidth size="small" onClick={() => onPick(null)}>
          Clear color
        </Button>
      </Box>
    </Popover>
  );
}

export function TagManager({
  tags,
  counts,
  onRename,
  onMerge,
  onDelete,
  onSetColor,
  onSetParent,
  onValidateParent,
  onClose,
}: Props) {
  const [filter, setFilter] = useState("");
  const [mode, setMode] = useState<Mode | null>(null);
  const [mergeTarget, setMergeTarget] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [colorAnchor, setColorAnchor] = useState<{ name: string; el: HTMLElement } | null>(null);
  const [parentError, setParentError] = useState<{ name: string; message: string } | null>(null);

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return tags;
    return tags.filter((t) => t.name.toLowerCase().includes(needle));
  }, [filter, tags]);

  const otherTagNames = useMemo(() => {
    if (mode?.kind !== "merge") return [] as string[];
    return tags.map((t) => t.name).filter((n) => n.toLowerCase() !== mode.from.toLowerCase());
  }, [mode, tags]);

  const handleRenameSubmit = async () => {
    if (mode?.kind !== "rename") return;
    const trimmed = mode.draft.trim();
    if (!trimmed || trimmed.toLowerCase() === mode.name.toLowerCase()) {
      setMode(null);
      return;
    }
    await onRename(mode.name, trimmed);
    setStatus(`renamed "${mode.name}" -> "${trimmed}"`);
    setMode(null);
  };

  const handleMergeSubmit = async () => {
    if (mode?.kind !== "merge" || !mergeTarget) return;
    const r = await onMerge(mode.from, mergeTarget);
    setStatus(`merged "${mode.from}" -> "${mergeTarget}" (${r.affected} bookmarks)`);
    setMode(null);
    setMergeTarget(null);
  };

  const handleDelete = async (name: string) => {
    if (
      !confirm(
        `Delete tag "${name}"? It will be removed from ${counts[name] ?? 0} bookmarks. The bookmarks themselves are not deleted.`,
      )
    ) {
      return;
    }
    await onDelete(name);
    setStatus(`deleted "${name}"`);
  };

  const handleColorPick = async (name: string, color: string | null) => {
    setColorAnchor(null);
    await onSetColor(name, color);
    setStatus(color ? `colored "${name}" ${color}` : `cleared color on "${name}"`);
  };

  const handleParentChange = async (name: string, nextParent: string | null) => {
    setParentError(null);
    if (nextParent !== null && onValidateParent) {
      const check = await onValidateParent(name, nextParent);
      if (!check.ok) {
        setParentError({ name, message: check.error ?? "Invalid parent" });
        return;
      }
    }
    try {
      await onSetParent(name, nextParent);
      setStatus(nextParent ? `"${name}" now under "${nextParent}"` : `cleared parent of "${name}"`);
    } catch (err) {
      setParentError({
        name,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <Stack spacing={2} sx={{ p: 3, width: { xs: "100vw", sm: 520 }, maxWidth: "100vw" }}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Typography variant="h6" sx={{ flex: 1 }}>
          Tags ({tags.length})
        </Typography>
        <IconButton onClick={onClose} aria-label="close">
          <CloseIcon />
        </IconButton>
      </Stack>

      <TextField
        size="small"
        label="Filter"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="search tag names…"
        fullWidth
      />

      {status && (
        <Typography variant="caption" color="success.main">
          {status}
        </Typography>
      )}

      <Divider />

      {filtered.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No tags match.
        </Typography>
      ) : (
        <Stack spacing={1}>
          {filtered.map((tag) => {
            const isRenaming = mode?.kind === "rename" && mode.name === tag.name;
            const isMerging = mode?.kind === "merge" && mode.from === tag.name;
            const ancestors = ancestorChainOf(tag.name, tags);
            const blockedParents = descendantNamesOf(tag.name, tags);
            const parentOptions = tags
              .map((t) => t.name)
              .filter(
                (n) =>
                  n.toLowerCase() !== tag.name.toLowerCase() &&
                  !blockedParents.has(n.toLowerCase()),
              );
            const errForThisTag =
              parentError?.name.toLowerCase() === tag.name.toLowerCase()
                ? parentError.message
                : null;

            return (
              <Box
                key={tag.name}
                sx={{
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1,
                  p: 1.5,
                }}
              >
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Box
                    component="button"
                    type="button"
                    aria-label={`change color of ${tag.name}`}
                    onClick={(e) => setColorAnchor({ name: tag.name, el: e.currentTarget })}
                    sx={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      border: 1,
                      borderColor: "divider",
                      bgcolor: tag.color ?? "transparent",
                      cursor: "pointer",
                      p: 0,
                      backgroundImage: tag.color
                        ? "none"
                        : "repeating-linear-gradient(45deg, rgba(0,0,0,0.08) 0 4px, transparent 4px 8px)",
                    }}
                  />
                  <Chip
                    label={tag.name}
                    size="small"
                    variant={tag.color ? "filled" : "outlined"}
                    sx={tag.color ? { bgcolor: tag.color } : undefined}
                  />
                  {ancestors.length > 0 && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontStyle: "italic" }}
                    >
                      {ancestors
                        .slice()
                        .reverse()
                        .map((a) => a.name)
                        .join(" › ")}
                      {" › "}
                      {tag.name}
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.secondary">
                    {counts[tag.name] ?? 0} bookmarks
                  </Typography>
                  <Box sx={{ flex: 1 }} />
                  <IconButton
                    size="small"
                    aria-label="rename"
                    onClick={() => setMode({ kind: "rename", name: tag.name, draft: tag.name })}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    aria-label="merge into"
                    onClick={() => {
                      setMode({ kind: "merge", from: tag.name });
                      setMergeTarget(null);
                    }}
                  >
                    <CallMergeIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    aria-label="delete"
                    color="error"
                    onClick={() => handleDelete(tag.name)}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>

                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                  <Autocomplete
                    size="small"
                    options={parentOptions}
                    value={tag.parentName ?? null}
                    onChange={(_, v) => handleParentChange(tag.name, v)}
                    sx={{ flex: 1 }}
                    isOptionEqualToValue={(opt, val) => opt.toLowerCase() === val.toLowerCase()}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Parent tag"
                        placeholder="(no parent)"
                        error={Boolean(errForThisTag)}
                        helperText={errForThisTag ?? " "}
                      />
                    )}
                  />
                </Stack>

                {isRenaming && (
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                    <TextField
                      size="small"
                      value={mode.draft}
                      onChange={(e) => setMode({ ...mode, draft: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRenameSubmit();
                        if (e.key === "Escape") setMode(null);
                      }}
                      label="New name"
                      autoFocus
                      sx={{ flex: 1 }}
                    />
                    <IconButton color="primary" onClick={handleRenameSubmit}>
                      <CheckIcon />
                    </IconButton>
                    <IconButton onClick={() => setMode(null)}>
                      <CloseIcon />
                    </IconButton>
                  </Stack>
                )}

                {isMerging && (
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                    <Autocomplete
                      freeSolo
                      size="small"
                      options={otherTagNames}
                      value={mergeTarget}
                      onChange={(_, v) => setMergeTarget(typeof v === "string" ? v : null)}
                      onInputChange={(_, v) => setMergeTarget(v)}
                      sx={{ flex: 1 }}
                      renderInput={(params) => (
                        <TextField {...params} label={`Merge "${tag.name}" into…`} autoFocus />
                      )}
                    />
                    <IconButton color="primary" onClick={handleMergeSubmit} disabled={!mergeTarget}>
                      <CheckIcon />
                    </IconButton>
                    <IconButton
                      onClick={() => {
                        setMode(null);
                        setMergeTarget(null);
                      }}
                    >
                      <CloseIcon />
                    </IconButton>
                  </Stack>
                )}
              </Box>
            );
          })}
        </Stack>
      )}

      <Box sx={{ flex: 1 }} />
      <Stack direction="row" justifyContent="flex-end">
        <Button onClick={onClose}>Close</Button>
      </Stack>

      {colorAnchor && (
        <ColorPickerPopover
          current={tags.find((t) => t.name === colorAnchor.name)?.color ?? null}
          anchorEl={colorAnchor.el}
          onClose={() => setColorAnchor(null)}
          onPick={(c) => handleColorPick(colorAnchor.name, c)}
        />
      )}
    </Stack>
  );
}
