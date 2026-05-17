import type { DomainStrategy } from "./index";

const PDF_PATTERN = /^\/pdf\/([\w.-]+?)(?:\.pdf)?$/i;
const VERSIONED_ID = /^(\d{4}\.\d{4,5})v\d+$/;

export const arxiv: DomainStrategy = (url, ctx) => {
  url.hostname = "arxiv.org";

  const pdfMatch = url.pathname.match(PDF_PATTERN);
  if (pdfMatch) {
    url.pathname = `/abs/${pdfMatch[1]}`;
  }

  const absMatch = url.pathname.match(/^\/abs\/([\w.-]+)$/);
  if (absMatch) {
    const versioned = absMatch[1].match(VERSIONED_ID);
    if (versioned) {
      url.pathname = `/abs/${versioned[1]}`;
    }
  }

  if (!ctx.keepFragments) {
    url.hash = "";
  }
  return url;
};
