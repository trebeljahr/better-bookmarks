import type { DomainStrategy } from "./index";

export const google: DomainStrategy = (url, ctx) => {
  if (url.hostname === "docs.google.com") {
    const docMatch = url.pathname.match(
      /^\/(document|spreadsheets|presentation|forms)\/d\/([A-Za-z0-9_-]+)/,
    );
    if (docMatch) {
      const canonical = `/${docMatch[1]}/d/${docMatch[2]}/edit`;
      const hadParams = url.searchParams.size > 0;
      const hadHash = url.hash !== "";
      const pathChanged = url.pathname !== canonical;
      url.pathname = canonical;
      for (const key of Array.from(url.searchParams.keys())) {
        url.searchParams.delete(key);
      }
      if (!ctx.keepFragments) {
        url.hash = "";
      }
      if (pathChanged || hadParams || (hadHash && !ctx.keepFragments)) {
        ctx.emit("google:docs-normalize-edit");
      }
    }
    return url;
  }

  if (url.hostname === "drive.google.com") {
    const fileMatch = url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]+)/);
    if (fileMatch) {
      const canonical = `/file/d/${fileMatch[1]}/view`;
      const hadParams = url.searchParams.size > 0;
      const hadHash = url.hash !== "";
      const pathChanged = url.pathname !== canonical;
      url.pathname = canonical;
      for (const key of Array.from(url.searchParams.keys())) {
        url.searchParams.delete(key);
      }
      if (!ctx.keepFragments) {
        url.hash = "";
      }
      if (pathChanged || hadParams || (hadHash && !ctx.keepFragments)) {
        ctx.emit("google:drive-normalize-view");
      }
    }
    return url;
  }

  return url;
};
