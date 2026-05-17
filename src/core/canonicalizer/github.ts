import type { DomainStrategy } from "./index";

const REPO_ROOT = /^\/[\w.-]+\/[\w.-]+\/?$/;

export const github: DomainStrategy = (url, ctx) => {
  if (REPO_ROOT.test(url.pathname)) {
    url.pathname = url.pathname.replace(/\/$/, "");
    url.searchParams.delete("tab");
    url.searchParams.delete("q");
  }

  const isIssueOrPr = /\/issues\/\d+|\/pull\/\d+/.test(url.pathname);
  if (isIssueOrPr) {
    if (
      !ctx.keepFragments &&
      !url.hash.startsWith("#issuecomment-") &&
      !url.hash.startsWith("#discussion_r")
    ) {
      url.hash = "";
    }
    url.searchParams.delete("notification_referrer_id");
  }

  if (url.pathname.endsWith("/issues") || url.pathname.endsWith("/pulls")) {
    url.searchParams.delete("type");
  }

  return url;
};
