import type { DomainStrategy } from "./index";

const DROP_PARAMS = new Set(["s", "t", "cxt", "lang"]);

export const twitter: DomainStrategy = (url) => {
  url.hostname = "x.com";

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
