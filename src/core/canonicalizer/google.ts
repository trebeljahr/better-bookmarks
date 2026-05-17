import type { DomainStrategy } from "./index";

export const google: DomainStrategy = (url, ctx) => {
  if (url.hostname === "docs.google.com") {
    const docMatch = url.pathname.match(
      /^\/(document|spreadsheets|presentation|forms)\/d\/([A-Za-z0-9_-]+)/,
    );
    if (docMatch) {
      url.pathname = `/${docMatch[1]}/d/${docMatch[2]}/edit`;
      for (const key of Array.from(url.searchParams.keys())) {
        url.searchParams.delete(key);
      }
      if (!ctx.keepFragments) {
        url.hash = "";
      }
    }
    return url;
  }

  if (url.hostname === "drive.google.com") {
    const fileMatch = url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]+)/);
    if (fileMatch) {
      url.pathname = `/file/d/${fileMatch[1]}/view`;
      for (const key of Array.from(url.searchParams.keys())) {
        url.searchParams.delete(key);
      }
      if (!ctx.keepFragments) {
        url.hash = "";
      }
    }
    return url;
  }

  return url;
};
