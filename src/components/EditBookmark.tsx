import { IconButton, Rating, Stack, TextField } from "@mui/material";
import React from "react";
import { Bookmark } from "../hooks/useBookmarks";
import Tags from "./Tags";
import DeleteIcon from "@mui/icons-material/Delete";
import SaveIcon from "@mui/icons-material/Save";

type Props = {
  value: Bookmark;
  setValue: (value: Bookmark) => void;
  possibleTags: string[];
  toggleEditing: (url: string) => void;
};

export function EditBookmark({
  value,
  setValue,
  possibleTags = [],
  toggleEditing,
}: Props) {
  if (!value) return null;

  return (
    <Stack spacing={2}>
      <TextField
        label="Title"
        value={value.description}
        onChange={(ev) => {
          setValue({ ...value, description: ev.target.value });
        }}
      />
      <Rating
        name="customized-10"
        max={10}
        value={value.rating}
        onChange={(_, newValue) => {
          if (!newValue) return;
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
      <IconButton
        edge="end"
        aria-label="delete"
        onClick={() => toggleEditing(value.url)}
      >
        {/* <DeleteIcon /> */}
        <SaveIcon />
      </IconButton>
    </Stack>
  );
}
