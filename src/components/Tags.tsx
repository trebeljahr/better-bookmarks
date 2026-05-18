import { TagInput } from "@/components/ui/tag-input";

type Props = {
  setTags: (tags: string[]) => void;
  possibleOptions?: string[];
  tags?: string[];
};

export default function Tags({ tags = [], setTags, possibleOptions = [] }: Props) {
  return <TagInput value={tags} onChange={setTags} options={possibleOptions} />;
}
