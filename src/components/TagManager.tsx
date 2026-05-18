/**
 * TagManager — manage every tag in the store: rename, merge, delete.
 *
 * Renders inside a Drawer in the overview. The Tag schema also carries
 * color / parent / description; this surface focuses on the most
 * common destructive operations (rename + merge + delete) which carry
 * the biggest data-correctness risk and previously had no UI.
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
  onClose: () => void;
};

type Mode = { kind: "rename"; name: string; draft: string } | { kind: "merge"; from: string };

export function TagManager({ tags, counts, onRename, onMerge, onDelete, onClose }: Props) {
  const [filter, setFilter] = useState("");
  const [mode, setMode] = useState<Mode | null>(null);
  const [mergeTarget, setMergeTarget] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");

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
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip
                    label={tag.name}
                    size="small"
                    variant={tag.color ? "filled" : "outlined"}
                    sx={tag.color ? { bgcolor: tag.color } : undefined}
                  />
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
    </Stack>
  );
}
