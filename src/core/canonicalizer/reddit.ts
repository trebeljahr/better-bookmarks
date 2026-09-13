import type { DomainStrategy } from "./index";

const DROP_PARAMS = new Set(["context", "share_id", "chainedPosts", "rdt", "post_fullname"]);

export const reddit: DomainStrategy = (url, ctx) => {
  const originalHost = url.hostname;
  url.hostname = "www.reddit.com";
  if (originalHost !== "www.reddit.com") ctx.emit("reddit:normalize-host");

  const toDelete: string[] = [];
  for (const key of url.searchParams.keys()) {
    if (DROP_PARAMS.has(key)) {
      toDelete.push(key);
    }
  }
  for (const key of toDelete) {
    url.searchParams.delete(key);
  }
  if (toDelete.length > 0) ctx.emit("reddit:strip-share-params");

  return url;
};
