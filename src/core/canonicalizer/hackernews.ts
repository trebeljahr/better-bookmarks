import type { DomainStrategy } from "./index";

export const hackernews: DomainStrategy = (url, ctx) => {
  if (!ctx.keepFragments) {
    url.hash = "";
  }
  return url;
};
