import type { DomainStrategy } from "./index";

const REPO_ROOT = /^\/[\w.-]+\/[\w.-]+\/?$/;

export const github: DomainStrategy = (url, ctx) => {
  if (REPO_ROOT.test(url.pathname)) {
    const hadSlash = url.pathname.endsWith("/");
    url.pathname = url.pathname.replace(/\/$/, "");
    if (hadSlash) ctx.emit("github:strip-repo-root-slash");
    const hadTab = url.searchParams.has("tab");
    const hadQ = url.searchParams.has("q");
    url.searchParams.delete("tab");
    url.searchParams.delete("q");
    if (hadTab || hadQ) ctx.emit("github:strip-repo-root-noise");
  }

  const isIssueOrPr = /\/issues\/\d+|\/pull\/\d+/.test(url.pathname);
  if (isIssueOrPr) {
    if (
      !ctx.keepFragments &&
      url.hash !== "" &&
      !url.hash.startsWith("#issuecomment-") &&
      !url.hash.startsWith("#discussion_r")
    ) {
      url.hash = "";
      ctx.emit("github:strip-issue-fragment");
    }
    if (url.searchParams.has("notification_referrer_id")) {
      url.searchParams.delete("notification_referrer_id");
      ctx.emit("github:strip-notification-referrer");
    }
  }

  if (url.pathname.endsWith("/issues") || url.pathname.endsWith("/pulls")) {
    if (url.searchParams.has("type")) {
      url.searchParams.delete("type");
      ctx.emit("github:strip-list-type-param");
    }
  }

  return url;
};
