import type { DomainStrategy } from "./index";

const ASIN_PATTERN = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i;

export const amazon: DomainStrategy = (url, ctx) => {
  const match = url.pathname.match(ASIN_PATTERN);
  if (match) {
    url.pathname = `/dp/${match[1].toUpperCase()}`;
  }
  for (const key of Array.from(url.searchParams.keys())) {
    url.searchParams.delete(key);
  }
  if (!ctx.keepFragments) {
    url.hash = "";
  }
  return url;
};
