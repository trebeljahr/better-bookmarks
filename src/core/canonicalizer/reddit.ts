import type { DomainStrategy } from "./index";

const DROP_PARAMS = new Set(["context", "share_id", "chainedPosts", "rdt", "post_fullname"]);

export const reddit: DomainStrategy = (url) => {
  url.hostname = "www.reddit.com";

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
