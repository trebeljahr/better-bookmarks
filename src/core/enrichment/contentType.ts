/**
 * Heuristic content-type detector from a canonical URL.
 *
 * Deterministic and offline — we never fetch the page. Catches the obvious
 * 80% (GitHub repos, arxiv papers, YouTube videos, ...) and falls back to
 * "unknown" so the user can override in the popup or detail view.
 *
 * Order matters: the first matching rule wins. Put narrower rules first.
 */

import type { ContentType } from "../../shared/types";

type Rule = {
  host: RegExp;
  /** Optional path filter. If present, the pathname must match. */
  pathname?: RegExp;
  type: ContentType;
};

const RULES: ReadonlyArray<Rule> = [
  // Code / repos
  { host: /^gist\.github\.com$/, type: "repo" },
  { host: /^(www\.)?github\.com$/, pathname: /^\/[^/]+\/[^/]+(\/.*)?$/, type: "repo" },
  { host: /^gitlab\.com$/, pathname: /^\/[^/]+\/[^/]+(\/.*)?$/, type: "repo" },
  { host: /^codeberg\.org$/, pathname: /^\/[^/]+\/[^/]+(\/.*)?$/, type: "repo" },
  { host: /^bitbucket\.org$/, pathname: /^\/[^/]+\/[^/]+(\/.*)?$/, type: "repo" },

  // Libraries / packages
  { host: /^(www\.)?npmjs\.com$/, pathname: /^\/package\//, type: "library" },
  { host: /^pypi\.org$/, pathname: /^\/project\//, type: "library" },
  { host: /^crates\.io$/, pathname: /^\/crates\//, type: "library" },
  { host: /^rubygems\.org$/, pathname: /^\/gems\//, type: "library" },
  { host: /^pkg\.go\.dev$/, type: "library" },
  { host: /^hex\.pm$/, pathname: /^\/packages\//, type: "library" },

  // Papers
  { host: /^arxiv\.org$/, type: "paper" },
  { host: /^pubmed\.ncbi\.nlm\.nih\.gov$/, type: "paper" },
  { host: /^biorxiv\.org$/, type: "paper" },
  { host: /^scholar\.google\.com$/, type: "paper" },
  { host: /^openreview\.net$/, type: "paper" },
  { host: /^dl\.acm\.org$/, type: "paper" },
  { host: /^ieeexplore\.ieee\.org$/, type: "paper" },

  // Videos
  { host: /^(www\.|m\.)?youtube\.com$/, type: "video" },
  { host: /^youtu\.be$/, type: "video" },
  { host: /^(www\.)?vimeo\.com$/, type: "video" },
  { host: /^(www\.)?twitch\.tv$/, type: "video" },

  // Podcasts
  { host: /^open\.spotify\.com$/, pathname: /^\/episode\//, type: "podcast" },
  { host: /^podcasts\.apple\.com$/, type: "podcast" },
  { host: /^overcast\.fm$/, type: "podcast" },
  { host: /^pca\.st$/, type: "podcast" },

  // Books
  { host: /^(www\.)?goodreads\.com$/, type: "book" },
  { host: /^openlibrary\.org$/, type: "book" },

  // Threads / discussions
  { host: /^(www\.)?reddit\.com$/, pathname: /^\/r\/[^/]+\/comments\//, type: "thread" },
  { host: /^(x|twitter|mobile\.twitter)\.com$/, pathname: /\/status\//, type: "thread" },
  { host: /^news\.ycombinator\.com$/, pathname: /^\/item$/, type: "thread" },
  { host: /^lobste\.rs$/, pathname: /^\/s\//, type: "thread" },

  // Courses
  { host: /^(www\.)?coursera\.org$/, type: "course" },
  { host: /^(www\.)?udemy\.com$/, type: "course" },
  { host: /^(www\.)?edx\.org$/, type: "course" },
  { host: /^(www\.)?khanacademy\.org$/, type: "course" },

  // Reference / docs
  { host: /^developer\.mozilla\.org$/, type: "reference" },
  { host: /^docs\.python\.org$/, type: "reference" },
  { host: /^doc\.rust-lang\.org$/, type: "reference" },
  { host: /^reactjs\.org$|^react\.dev$/, type: "reference" },
  { host: /^developer\.apple\.com$/, type: "reference" },
  { host: /^docs?\./, type: "reference" },

  // Tool homepages
  { host: /^(www\.)?producthunt\.com$/, type: "tool" },

  // Encyclopedic articles
  { host: /wikipedia\.org$/, type: "article" },

  // Blog / article platforms
  { host: /^(www\.)?medium\.com$/, type: "article" },
  { host: /\.medium\.com$/, type: "article" },
  { host: /^(www\.)?substack\.com$/, type: "article" },
  { host: /\.substack\.com$/, type: "article" },
];

export function detectContentType(canonicalUrl: string): ContentType {
  let parsed: URL;
  try {
    parsed = new URL(canonicalUrl);
  } catch {
    return "unknown";
  }
  const host = parsed.hostname;
  const path = parsed.pathname;
  for (const rule of RULES) {
    if (!rule.host.test(host)) continue;
    if (rule.pathname && !rule.pathname.test(path)) continue;
    return rule.type;
  }
  return "unknown";
}
