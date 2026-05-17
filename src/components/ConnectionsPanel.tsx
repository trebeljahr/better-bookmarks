import AddLinkIcon from "@mui/icons-material/AddLink";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
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
  Tooltip,
  Typography,
} from "@mui/material";
import { useMemo, useState } from "react";
import type { SuggestedEdge } from "../core/edges/suggest";
import type { Bookmark, Edge, EdgeType } from "../shared/types";

type Props = {
  bookmark: Bookmark;
  allBookmarks: Bookmark[];
  edges: Edge[];
  suggestions: SuggestedEdge[];
  onLink: (toId: string, type: EdgeType, note?: string) => void;
  onUnlink: (edgeId: string) => void;
  onAcceptSuggestion: (suggestion: SuggestedEdge) => void;
};

const EDGE_TYPE_OPTIONS: ReadonlyArray<{ value: EdgeType; label: string }> = [
  { value: "related", label: "Related" },
  { value: "sequel", label: "Sequel of" },
  { value: "source", label: "Cites / source of" },
  { value: "rebuts", label: "Rebuts" },
  { value: "supersedes", label: "Supersedes" },
  { value: "translates", label: "Translation of" },
];

type LinkOption = {
  id: string;
  label: string;
  domain: string;
};

/**
 * Standalone, unwired connections panel for a single bookmark.
 *
 * The parent passes in the current edge list (manual only) and suggestions
 * (auto-tag / auto-domain candidates) and is responsible for actually
 * persisting changes — this component just emits callbacks.
 */
export function ConnectionsPanel({
  bookmark,
  allBookmarks,
  edges,
  suggestions,
  onLink,
  onUnlink,
  onAcceptSuggestion,
}: Props) {
  const [selectedTarget, setSelectedTarget] = useState<LinkOption | null>(null);
  const [linkType, setLinkType] = useState<EdgeType>("related");
  const [note, setNote] = useState("");

  const byId = useMemo(() => {
    const map = new Map<string, Bookmark>();
    for (const b of allBookmarks) map.set(b.id, b);
    return map;
  }, [allBookmarks]);

  const linkOptions = useMemo<LinkOption[]>(() => {
    const linkedIds = new Set<string>();
    for (const e of edges) {
      linkedIds.add(e.fromId);
      linkedIds.add(e.toId);
    }
    return allBookmarks
      .filter((b) => b.id !== bookmark.id && !linkedIds.has(b.id))
      .map((b) => ({
        id: b.id,
        label: b.title || b.canonicalUrl,
        domain: b.domain,
      }));
  }, [allBookmarks, bookmark.id, edges]);

  const handleSubmitLink = () => {
    if (!selectedTarget) return;
    onLink(selectedTarget.id, linkType, note.trim() || undefined);
    setSelectedTarget(null);
    setNote("");
    setLinkType("related");
  };

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="subtitle1" gutterBottom>
          Connections
        </Typography>
        {edges.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No connections yet. Link this bookmark to another below.
          </Typography>
        ) : (
          <Box
            component="ul"
            sx={{
              display: "flex",
              flexWrap: "wrap",
              gap: 1,
              listStyle: "none",
              p: 0,
              m: 0,
            }}
          >
            {edges.map((edge) => {
              const otherId = edge.fromId === bookmark.id ? edge.toId : edge.fromId;
              const other = byId.get(otherId);
              const label = other?.title || other?.canonicalUrl || otherId;
              const directionHint =
                edge.directed && edge.fromId === bookmark.id
                  ? " ->"
                  : edge.directed && edge.toId === bookmark.id
                    ? " <-"
                    : "";
              return (
                <li key={edge.id}>
                  <Tooltip title={edge.note || edge.type}>
                    <Chip
                      label={`${edge.type}${directionHint}: ${label}`}
                      onDelete={() => onUnlink(edge.id)}
                      variant="outlined"
                      size="small"
                    />
                  </Tooltip>
                </li>
              );
            })}
          </Box>
        )}
      </Box>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          Add a connection
        </Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems="flex-start">
          <Autocomplete
            sx={{ flex: 2, minWidth: 240 }}
            options={linkOptions}
            value={selectedTarget}
            onChange={(_, next) => setSelectedTarget(next)}
            getOptionLabel={(option) => option.label}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            renderOption={(props, option) => (
              <li {...props} key={option.id}>
                <Stack>
                  <Typography variant="body2">{option.label}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {option.domain}
                  </Typography>
                </Stack>
              </li>
            )}
            renderInput={(params) => (
              <TextField {...params} label="Bookmark" placeholder="Search by title..." />
            )}
          />
          <TextField
            select
            label="Type"
            value={linkType}
            onChange={(e) => setLinkType(e.target.value as EdgeType)}
            sx={{ flex: 1, minWidth: 160 }}
          >
            {EDGE_TYPE_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            sx={{ flex: 2, minWidth: 200 }}
          />
          <IconButton
            color="primary"
            aria-label="add connection"
            onClick={handleSubmitLink}
            disabled={!selectedTarget}
          >
            <AddLinkIcon />
          </IconButton>
        </Stack>
      </Paper>

      <Box>
        <Typography variant="subtitle1" gutterBottom>
          Suggested connections
        </Typography>
        {suggestions.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No suggestions right now. Add more tags to surface candidates.
          </Typography>
        ) : (
          <Stack spacing={1}>
            {suggestions.map((s) => {
              const other = byId.get(s.toId);
              const label = other?.title || other?.canonicalUrl || s.toId;
              return (
                <Paper
                  key={s.id}
                  variant="outlined"
                  sx={{
                    p: 1,
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                  }}
                >
                  <AutoAwesomeIcon color="action" fontSize="small" />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" noWrap>
                      {label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {s.reason} (strength {s.strength})
                    </Typography>
                  </Box>
                  <Button size="small" variant="outlined" onClick={() => onAcceptSuggestion(s)}>
                    Accept
                  </Button>
                </Paper>
              );
            })}
          </Stack>
        )}
      </Box>
    </Stack>
  );
}
