/**
 * SearchBar — presentational component for the bookmark search input.
 *
 * Intentionally has no knowledge of the search subsystem; the parent
 * passes in the controlled `query`, `setQuery`, current `resultCount`,
 * and any `parseError`. This makes it easy to test in isolation and
 * lets the overview/popup decide how to drive it.
 *
 * NOT yet imported anywhere. The main thread wires it in during Phase 3
 * integration.
 */

import { Stack, TextField, Typography } from "@mui/material";

export type SearchBarProps = {
  query: string;
  setQuery: (s: string) => void;
  resultCount: number;
  parseError?: string | null;
};

export function SearchBar({ query, setQuery, resultCount, parseError }: SearchBarProps) {
  return (
    <Stack spacing={1} sx={{ width: "100%" }}>
      <TextField
        fullWidth
        label="Search bookmarks"
        placeholder="react hooks tag:frontend rating:>=7"
        value={query}
        onChange={(ev) => setQuery(ev.target.value)}
        error={Boolean(parseError)}
        helperText={parseError ?? undefined}
        inputProps={{ "aria-label": "search bookmarks" }}
      />
      <Typography variant="caption" color="text.secondary">
        {resultCount === 1 ? "1 result" : `${resultCount} results`}
      </Typography>
    </Stack>
  );
}

export default SearchBar;
