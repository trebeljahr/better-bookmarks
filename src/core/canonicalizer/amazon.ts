import type { DomainStrategy } from "./index";

const ASIN_PATTERN = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i;

export const amazon: DomainStrategy = (url, ctx) => {
  const match = url.pathname.match(ASIN_PATTERN);
  if (match) {
    const canonical = `/dp/${match[1].toUpperCase()}`;
    if (url.pathname !== canonical) {
      url.pathname = canonical;
      ctx.emit("amazon:collapse-to-dp-asin");
    }
  }
  const paramKeys = Array.from(url.searchParams.keys());
  for (const key of paramKeys) {
    url.searchParams.delete(key);
  }
  if (paramKeys.length > 0) ctx.emit("amazon:strip-all-query");

  if (!ctx.keepFragments && url.hash !== "") {
    url.hash = "";
    ctx.emit("amazon:strip-fragment");
  }
  return url;
};
