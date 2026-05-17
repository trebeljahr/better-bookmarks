import type { DomainStrategy } from "./index";

const KEEP_PARAMS = new Set(["v", "list"]);
const PLAYLIST_ID_PREFIXES = /^(PL|OL|UU|LL|FL|RD)/;

export const youtube: DomainStrategy = (url, ctx) => {
  if (url.hostname === "youtu.be") {
    const videoId = url.pathname.replace(/^\//, "");
    if (videoId) {
      url.hostname = "www.youtube.com";
      url.pathname = "/watch";
      url.searchParams.set("v", videoId);
    }
  } else {
    url.hostname = "www.youtube.com";
  }

  const shortMatch = url.pathname.match(/^\/(shorts|embed|v)\/([\w-]+)/);
  if (shortMatch) {
    const videoId = shortMatch[2];
    url.pathname = "/watch";
    url.searchParams.set("v", videoId);
  }

  const toDelete: string[] = [];
  for (const key of url.searchParams.keys()) {
    if (!KEEP_PARAMS.has(key)) {
      toDelete.push(key);
    }
  }
  for (const key of toDelete) {
    url.searchParams.delete(key);
  }

  const list = url.searchParams.get("list");
  if (list && !PLAYLIST_ID_PREFIXES.test(list)) {
    url.searchParams.delete("list");
  }

  if (!ctx.keepFragments) {
    url.hash = "";
  }
  return url;
};
