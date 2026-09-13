import type { DomainStrategy } from "./index";

const DROP_PARAMS = new Set(["s", "t", "cxt", "lang"]);

export const twitter: DomainStrategy = (url, ctx) => {
  const originalHost = url.hostname;
  url.hostname = "x.com";
  if (originalHost !== "x.com") ctx.emit("twitter:rewrite-to-x");

  const toDelete: string[] = [];
  for (const key of url.searchParams.keys()) {
    if (DROP_PARAMS.has(key)) {
      toDelete.push(key);
    }
  }
  for (const key of toDelete) {
    url.searchParams.delete(key);
  }
  if (toDelete.length > 0) ctx.emit("twitter:strip-share-params");

  return url;
};
