import SaveIcon from "@mui/icons-material/Save";
import { IconButton, Rating, Stack, TextField } from "@mui/material";
import type { Bookmark } from "../hooks/useBookmarks";
import Tags from "./Tags";

type Props = {
  value: Bookmark;
  setValue: (value: Bookmark) => void;
  possibleTags: string[];
  toggleEditing: (id: string) => void;
};

export function EditBookmark({ value, setValue, possibleTags = [], toggleEditing }: Props) {
  if (!value) return null;

  return (
    <Stack spacing={2}>
      <TextField
        label="Title"
        value={value.title}
        onChange={(ev) => {
          setValue({ ...value, title: ev.target.value });
        }}
      />
      <Rating
        name="customized-10"
        max={10}
        value={value.rating ?? 0}
        onChange={(_, newValue) => {
          if (newValue === null) return;
          setValue({ ...value, rating: newValue });
        }}
      />
      <Tags
        tags={value.tags}
        setTags={(newTags) => {
          setValue({ ...value, tags: newTags as string[] });
        }}
        possibleOptions={possibleTags}
      />
      <IconButton edge="end" aria-label="save" onClick={() => toggleEditing(value.id)}>
        <SaveIcon />
      </IconButton>
    </Stack>
  );
}
