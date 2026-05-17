import type { DomainStrategy } from "./index";

export const wikipedia: DomainStrategy = (url, ctx) => {
  if (!ctx.keepFragments) {
    url.hash = "";
  }
  return url;
};
