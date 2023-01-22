import * as React from "react";
import Checkbox from "@mui/material/Checkbox";
import TextField from "@mui/material/TextField";
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank";
import CheckBoxIcon from "@mui/icons-material/CheckBox";

interface FilmOptionType {
  inputValue?: string;
  title: string;
}

const filter = createFilterOptions<FilmOptionType>();

const icon = <CheckBoxOutlineBlankIcon fontSize="small" />;
const checkedIcon = <CheckBoxIcon fontSize="small" />;

export default function Tags() {
  return (
    <Autocomplete
      multiple
      id="checkboxes-tags-demo"
      options={options}
      disableCloseOnSelect
      filterOptions={(options, params) => {
        const filtered = filter(options, params);

        const { inputValue } = params;
        const isExisting = options.some(
          (option) => inputValue === option.title
        );
        if (inputValue !== "" && !isExisting) {
          filtered.push({
            inputValue,
            title: `Add "${inputValue}"`,
          });
        }
        return filtered;
      }}
      getOptionLabel={(option) => {
        if (typeof option === "string") {
          return option;
        }
        if (option.inputValue) {
          return option.inputValue;
        }
        return option.title;
      }}
      renderOption={(props, option, { selected }) => (
        <li {...props}>
          <Checkbox
            icon={icon}
            checkedIcon={checkedIcon}
            style={{ marginRight: 8 }}
            checked={selected}
          />
          {option.title}
        </li>
      )}
      style={{ width: 500 }}
      renderInput={(params) => (
        <TextField {...params} label="Checkboxes" placeholder="Favorites" />
      )}
    />
  );
}

const options: readonly FilmOptionType[] = [
  { title: "The Shawshank Redemption" },
  { title: "The Godfather" },
  { title: "The Godfather: Part II" },
  { title: "The Dark Knight" },
  { title: "12 Angry Men" },
  { title: "Schindler's List" },
  { title: "Pulp Fiction" },
  { title: "The Lord of the Rings: The Return of the King" },
  { title: "The Good, the Bad and the Ugly" },
  { title: "Fight Club" },
  { title: "The Lord of the Rings: The Fellowship of the Ring" },
  { title: "Star Wars: Episode V - The Empire Strikes Back" },
  { title: "Forrest Gump" },
  { title: "Inception" },
  { title: "The Lord of the Rings: The Two Towers" },
  { title: "One Flew Over the Cuckoo's Nest" },
  { title: "Goodfellas" },
  { title: "The Matrix" },
  { title: "Seven Samurai" },
  { title: "Star Wars: Episode IV - A New Hope" },
  { title: "City of God" },
  { title: "Se7en" },
  { title: "The Silence of the Lambs" },
  { title: "It's a Wonderful Life" },
  { title: "Life Is Beautiful" },
  { title: "The Usual Suspects" },
  { title: "Léon: The Professional" },
  { title: "Spirited Away" },
  { title: "Saving Private Ryan" },
  { title: "Once Upon a Time in the West" },
  { title: "American History X" },
  { title: "Interstellar" },
];
