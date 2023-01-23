import * as React from "react";
import Checkbox from "@mui/material/Checkbox";
import TextField from "@mui/material/TextField";
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank";
import CheckBoxIcon from "@mui/icons-material/CheckBox";

export interface FilmOptionType {
  inputValue?: string;
  title: string;
}

const filter = createFilterOptions<FilmOptionType>();

const icon = <CheckBoxOutlineBlankIcon fontSize="small" />;
const checkedIcon = <CheckBoxIcon fontSize="small" />;

type Props = {
  tags: FilmOptionType[];
  setTags: (newValue: FilmOptionType[]) => void;
};

export default function Tags({ tags, setTags }: Props) {
  return (
    <Autocomplete
      multiple
      id="checkboxes-tags-demo"
      options={options}
      value={tags}
      onChange={(_, newValue) => {
        setTags(newValue);
      }}
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
        <TextField {...params} label="Tags" placeholder="Enter Tags here..." />
      )}
    />
  );
}

const options: readonly FilmOptionType[] = [
  { title: "Biochemistry" },
  { title: "Programming" },
  { title: "Web Dev" },
  { title: "Philosophy" },
  { title: "Psychology" },
  { title: "Politics" },
  { title: "Neuroscience" },
  { title: "Engineering" },
  { title: "Electronics" },
  { title: "Hardware" },
  { title: "Arduino" },
  { title: "Game Development" },
  { title: "Personal Development" },
  { title: "Productivity" },
  { title: "AI" },
  { title: "Hacking" },
  { title: "Finances" },
  { title: "Design" },
  { title: "Art" },
  { title: "Traveling" },
  { title: "Mathematics" },
  { title: "Music" },
  { title: "Piano" },
  { title: "Go" },
  { title: "Ruby" },
  { title: "Haskell" },
  { title: "C" },
  { title: "Python" },
  { title: "Clojure" },
  { title: "Rust" },
  { title: "Forth" },
  { title: "JS/TS" },
  { title: "Algorithms" },
  { title: "Compilers" },
  { title: "Crypto" },
  { title: "Linux" },
  { title: "Terminal" },
  { title: "Graphics" },
  { title: "3D" },
  { title: "three-js" },
  { title: "DevOps" },
  { title: "Mobile Development" },
  { title: "Desktop Development" },
  { title: "Favorite Articles" },
  { title: "Writing" },
  { title: "Content Marketing" },
  { title: "SEO" },
  { title: "Freediving" },
  { title: "Videos" },
  { title: "Online Shop" },
  { title: "Brain" },
  { title: "Neuroplasticity" },
  { title: "Meditation" },
  { title: "Wisdom" },
];
