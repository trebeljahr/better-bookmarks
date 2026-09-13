import type { DomainStrategy } from "./index";

const KEEP_PARAMS = new Set(["v", "list"]);
const PLAYLIST_ID_PREFIXES = /^(PL|OL|UU|LL|FL|RD)/;

export const youtube: DomainStrategy = (url, ctx) => {
  const originalHost = url.hostname;

  if (url.hostname === "youtu.be") {
    const videoId = url.pathname.replace(/^\//, "");
    if (videoId) {
      url.hostname = "www.youtube.com";
      url.pathname = "/watch";
      url.searchParams.set("v", videoId);
      ctx.emit("youtube:youtu-be-expand");
    }
  } else {
    url.hostname = "www.youtube.com";
    // Any host other than www./youtu.be that got rewritten (m., music., etc.)
    // counts as a straight normalize. `youtube:youtu-be-expand` already
    // covers the short-link case.
    if (originalHost !== "www.youtube.com") {
      ctx.emit("youtube:normalize-host");
    }
  }

  const shortMatch = url.pathname.match(/^\/(shorts|embed|v)\/([\w-]+)/);
  if (shortMatch) {
    const videoId = shortMatch[2];
    url.pathname = "/watch";
    url.searchParams.set("v", videoId);
    ctx.emit("youtube:short-form-expand");
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
  if (toDelete.length > 0) ctx.emit("youtube:strip-non-video-params");

  const list = url.searchParams.get("list");
  if (list && !PLAYLIST_ID_PREFIXES.test(list)) {
    url.searchParams.delete("list");
    ctx.emit("youtube:strip-watch-later");
  }

  if (!ctx.keepFragments) {
    url.hash = "";
  }
  return url;
};
