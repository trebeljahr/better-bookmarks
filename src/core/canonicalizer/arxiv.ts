import type { DomainStrategy } from "./index";

// `/pdf/<id>` and `/pdf/<id>.pdf` both collapse to `/abs/<id>`. If the
// user bookmarked a specific version (`/pdf/2401.12345v2[.pdf]`), the
// version suffix is preserved on the abs form (`/abs/2401.12345v2`).
// See DECISIONS D8: version is meaningful identity; only the render
// format changes.
const PDF_PATTERN = /^\/pdf\/([\w.-]+?)(?:\.pdf)?$/i;

export const arxiv: DomainStrategy = (url, ctx) => {
  url.hostname = "arxiv.org";

  const pdfMatch = url.pathname.match(PDF_PATTERN);
  if (pdfMatch) {
    url.pathname = `/abs/${pdfMatch[1]}`;
  }

  if (!ctx.keepFragments) {
    url.hash = "";
  }
  return url;
};
