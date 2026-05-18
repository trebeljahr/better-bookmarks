/**
 * BulkActionsBar — appears above the result list when 1+ bookmarks are
 * selected via the row checkboxes.
 *
 * Operations:
 *   - Add tag to all selected (auto-complete from the existing tag set)
 *   - Mark status (unread / reading / read / archived)
 *   - Delete all selected (with confirm)
 */

import CheckIcon from "@mui/icons-material/Check";
import DeleteIcon from "@mui/icons-material/Delete";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useState } from "react";
import type { ReadStatus } from "../shared/types";

type Props = {
  selectedCount: number;
  possibleTags: string[];
  onClear: () => void;
  onAddTag: (tag: string) => void;
  onSetStatus: (status: ReadStatus) => void;
  onDelete: () => void;
};

const STATUS_OPTIONS: ReadonlyArray<ReadStatus> = ["unread", "reading", "read", "archived"];

export function BulkActionsBar({
  selectedCount,
  possibleTags,
  onClear,
  onAddTag,
  onSetStatus,
  onDelete,
}: Props) {
  const [tagDraft, setTagDraft] = useState<string | null>(null);

  const handleSubmitTag = () => {
    if (!tagDraft) return;
    onAddTag(tagDraft.trim());
    setTagDraft(null);
  };

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
        <Chip
          label={`${selectedCount} selected`}
          color="primary"
          onDelete={onClear}
          variant="filled"
          sx={{ mr: 1 }}
        />
        <Autocomplete
          freeSolo
          size="small"
          options={possibleTags}
          value={tagDraft}
          onChange={(_, v) => setTagDraft(typeof v === "string" ? v : null)}
          onInputChange={(_, v) => setTagDraft(v)}
          sx={{ width: 220 }}
          renderInput={(params) => (
            <TextField {...params} placeholder="Add tag…" aria-label="add tag to selected" />
          )}
        />
        <IconButton
          color="primary"
          onClick={handleSubmitTag}
          disabled={!tagDraft}
          aria-label="apply tag"
        >
          <CheckIcon />
        </IconButton>

        <Box sx={{ width: 12 }} />

        <TextField
          select
          size="small"
          label="Set status"
          defaultValue=""
          onChange={(e) => {
            const v = e.target.value as ReadStatus | "";
            if (v) onSetStatus(v);
          }}
          sx={{ width: 160 }}
        >
          <MenuItem value="" disabled>
            choose
          </MenuItem>
          {STATUS_OPTIONS.map((s) => (
            <MenuItem key={s} value={s}>
              {s}
            </MenuItem>
          ))}
        </TextField>

        <Box sx={{ flex: 1, minWidth: 16 }} />

        <Button
          variant="text"
          color="error"
          startIcon={<DeleteIcon />}
          onClick={() => {
            if (confirm(`Delete ${selectedCount} bookmarks? This cannot be undone.`)) {
              onDelete();
            }
          }}
        >
          Delete
        </Button>
        <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
          <LocalOfferIcon fontSize="inherit" sx={{ verticalAlign: "middle", mr: 0.5 }} />
          tag adds to existing tags
        </Typography>
      </Stack>
    </Paper>
  );
}
