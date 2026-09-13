import type { DomainStrategy } from "./index";

export const hackernews: DomainStrategy = (url, ctx) => {
  if (!ctx.keepFragments && url.hash !== "") {
    url.hash = "";
    ctx.emit("hackernews:strip-fragment");
  }
  return url;
};
