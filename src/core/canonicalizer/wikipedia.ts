import type { DomainStrategy } from "./index";

export const wikipedia: DomainStrategy = (url, ctx) => {
  if (!ctx.keepFragments && url.hash !== "") {
    url.hash = "";
    ctx.emit("wikipedia:strip-section-fragment");
  }
  return url;
};
