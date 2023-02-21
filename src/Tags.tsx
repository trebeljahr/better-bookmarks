import * as React from "react";
import Checkbox from "@mui/material/Checkbox";
import TextField from "@mui/material/TextField";
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank";
import CheckBoxIcon from "@mui/icons-material/CheckBox";

export interface TagAutocompleteType {
  inputValue?: string;
  title: string;
}

const filter = createFilterOptions<TagAutocompleteType>();

const icon = <CheckBoxOutlineBlankIcon fontSize="small" />;
const checkedIcon = <CheckBoxIcon fontSize="small" />;

type Props = {
  setTags: React.Dispatch<React.SetStateAction<string[]>>;
  possibleOptions?: string[];
  tags?: string[];
};

export default function Tags({
  tags = [],
  setTags,
  possibleOptions = [],
}: Props) {
  const combinedOptions: TagAutocompleteType[] = [
    ...new Set([...possibleOptions, ...hardcodedOptions]),
  ].map((option) => ({ title: option, inputValue: "" }));

  console.log({ provided: tags });
  return (
    <Autocomplete
      multiple
      id="checkboxes-tags-demo"
      options={combinedOptions}
      value={tags.map((tag) => ({ title: tag, inputValue: "" }))}
      // onChange={() => {}}
      onChange={(_, newValue) => {
        console.log({ newValue });

        setTags(newValue.map((tag) => tag.inputValue || tag.title));
      }}
      isOptionEqualToValue={(option, value) => option.title === value.title}
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
      renderOption={(props, option, state) => {
        // console.log(state);
        // console.log(option);

        const { selected } = state;
        return (
          <li {...props}>
            <Checkbox
              icon={icon}
              checkedIcon={checkedIcon}
              style={{ marginRight: 8 }}
              checked={selected}
            />
            {option.title}
          </li>
        );
      }}
      style={{ width: 500 }}
      renderInput={(params) => (
        <TextField {...params} label="Tags" placeholder="Enter Tags here..." />
      )}
    />
  );
}

const hardcodedOptions: readonly string[] = [
  "Biochemistry",
  "Programming",
  "Web Dev",
  "Philosophy",
  "Psychology",
  "Politics",
  "Neuroscience",
  "Engineering",
  "Electronics",
  "Hardware",
  "Arduino",
  "Game Development",
  "Personal Development",
  "Productivity",
  "AI",
  "Hacking",
  "Finances",
  "Design",
  "Art",
  "Traveling",
  "Mathematics",
  "Music",
  "Piano",
  "Go",
  "Ruby",
  "Haskell",
  "C",
  "Python",
  "Clojure",
  "Rust",
  "Forth",
  "JS/TS",
  "Algorithms",
  "Compilers",
  "Crypto",
  "Linux",
  "Terminal",
  "Graphics",
  "3D",
  "three-js",
  "DevOps",
  "Mobile Development",
  "Desktop Development",
  "Favorite Articles",
  "Writing",
  "Content Marketing",
  "SEO",
  "Freediving",
  "Videos",
  "Online Shop",
  "Brain",
  "Neuroplasticity",
  "Meditation",
  "Wisdom",
];
