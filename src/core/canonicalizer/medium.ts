import type { DomainStrategy } from "./index";

const DROP_PARAMS = new Set(["source", "sk", "gi", "responsesOpen"]);

export const medium: DomainStrategy = (url) => {
  const toDelete: string[] = [];
  for (const key of url.searchParams.keys()) {
    if (DROP_PARAMS.has(key)) {
      toDelete.push(key);
    }
  }
  for (const key of toDelete) {
    url.searchParams.delete(key);
  }
  return url;
};
