export const GLOBAL_TRACKING_PARAMS: ReadonlySet<string> = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "utm_name",
  "utm_brand",
  "utm_social",
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "yclid",
  "twclid",
  "_hsenc",
  "_hsmi",
  "mc_cid",
  "mc_eid",
  "mkt_tok",
  "ref",
  "ref_src",
  "ref_url",
  "source",
  "referrer",
  "igshid",
  "igsh",
  "share_app_name",
  "spm",
  "scm",
  "__twitter_impression",
  "ck_subscriber_id",
]);

export const UNBOOKMARKABLE_SCHEMES: ReadonlySet<string> = new Set([
  "chrome:",
  "chrome-extension:",
  "edge:",
  "about:",
  "file:",
  "javascript:",
  "data:",
  "view-source:",
]);

/**
 * A single canonicalization rule. Every transformation `canonicalize()`
 * performs is registered here so the UI can explain, per bookmark, why
 * two URLs are being treated as the same identity.
 *
 * Rule ids are stable, dot-namespaced strings (`domain:transform`) and
 * are safe to persist — they show up on the `CanonicalizeResult` as
 * `appliedRules` when the transform actually fires. Descriptions are
 * user-facing, so they explain *what changed* and *why it is safe*.
 */
export type CanonicalizationRule = {
  id: string;
  description: string;
};

const RULES: CanonicalizationRule[] = [
  // ── global ────────────────────────────────────────────────────
  // Host case and default ports are normalised by the WHATWG URL
  // parser during `new URL(raw)`, so no rule id fires for those two
  // (they're already gone by the time canonicalize() sees the URL).
  {
    id: "global:strip-tracking-params",
    description:
      "Marketing/tracking query parameters (utm_*, fbclid, gclid, ref, and similar) removed. They record how you arrived but do not change what the page returns.",
  },
  {
    id: "global:strip-text-fragment",
    description:
      "Text fragment (#:~:text=…) removed. It only scrolls to a highlighted phrase and does not change which page loads.",
  },
  {
    id: "global:sort-query-params",
    description:
      "Query parameters sorted alphabetically for stable dedup. Servers ignore the order, so ?a=1&b=2 and ?b=2&a=1 name the same resource.",
  },
  {
    id: "global:strip-locale-prefix",
    description:
      "Leading /<locale>/ path segment removed for domains configured to mirror one canonical tree across languages.",
  },

  // ── youtube ───────────────────────────────────────────────────
  {
    id: "youtube:normalize-host",
    description:
      "YouTube host normalised to www.youtube.com. m., music., youtu.be all serve the same video ids.",
  },
  {
    id: "youtube:youtu-be-expand",
    description:
      "youtu.be/<id> expanded to www.youtube.com/watch?v=<id>. Same video, canonical URL shape.",
  },
  {
    id: "youtube:short-form-expand",
    description:
      "YouTube /shorts/, /embed/ and /v/ URLs expanded to /watch?v=<id>. They all play the same video.",
  },
  {
    id: "youtube:strip-non-video-params",
    description:
      "YouTube parameters other than v= and list= removed (t= start-time, si= share tracking, feature=, ab_channel=, and similar). They do not change which video plays.",
  },
  {
    id: "youtube:strip-watch-later",
    description:
      "YouTube list=WL (Watch Later) and other private-playlist ids removed. They point at a personal queue, not at a shareable playlist.",
  },

  // ── twitter / x ───────────────────────────────────────────────
  {
    id: "twitter:rewrite-to-x",
    description:
      "twitter.com and mobile.twitter.com rewritten to x.com. Both hosts serve the same tweets since the rename.",
  },
  {
    id: "twitter:strip-share-params",
    description:
      "Twitter/X share parameters (s=, t=, cxt=, lang=) removed. They tag the sharer, not the tweet.",
  },

  // ── reddit ────────────────────────────────────────────────────
  {
    id: "reddit:normalize-host",
    description:
      "Reddit host normalised to www.reddit.com. old., new., i. all render the same thread.",
  },
  {
    id: "reddit:strip-share-params",
    description:
      "Reddit share parameters (share_id, context, chainedPosts, rdt, post_fullname) removed. They record who shared the link, not what it points at.",
  },

  // ── github ────────────────────────────────────────────────────
  {
    id: "github:strip-repo-root-slash",
    description:
      "Trailing slash removed on github.com/<user>/<repo>. GitHub serves the same page either way.",
  },
  {
    id: "github:strip-repo-root-noise",
    description:
      "?tab= and ?q= removed on a bare github.com/<user>/<repo> URL. They only change which sidebar/tab is highlighted.",
  },
  {
    id: "github:strip-issue-fragment",
    description:
      "Non-comment fragments removed on issue and pull-request URLs, but #issuecomment-N and #discussion_rN are kept because they anchor real content.",
  },
  {
    id: "github:strip-notification-referrer",
    description:
      "notification_referrer_id removed on issue and pull-request URLs. It only tags where a notification came from.",
  },
  {
    id: "github:strip-list-type-param",
    description:
      "?type= removed on /issues and /pulls listing URLs. It only changes which filter tab is highlighted.",
  },

  // ── wikipedia ─────────────────────────────────────────────────
  {
    id: "wikipedia:strip-section-fragment",
    description:
      "Section anchor (#Foo) removed. It only scrolls to a heading — the article is the same regardless. Turn on 'Keep Wikipedia fragments' in Settings to treat each section as its own bookmark.",
  },

  // ── amazon ────────────────────────────────────────────────────
  {
    id: "amazon:collapse-to-dp-asin",
    description:
      "Amazon product URLs collapsed to /dp/<ASIN>. The slug, referral path (/ref=…) and /gp/product/ form all name the same product.",
  },
  {
    id: "amazon:strip-all-query",
    description:
      "All Amazon query parameters removed. They carry search context, referral tags and page state, not product identity.",
  },
  {
    id: "amazon:strip-fragment",
    description:
      "Fragment removed on Amazon product URLs. It only anchors within the same product page.",
  },

  // ── medium ────────────────────────────────────────────────────
  {
    id: "medium:strip-share-params",
    description:
      "Medium share parameters (source, sk, gi, responsesOpen) removed. They record entry point and reader session, not the article.",
  },

  // ── stackoverflow / stackexchange ─────────────────────────────
  {
    id: "stackoverflow:strip-slug-cruft",
    description:
      "Trailing segments after the question slug removed (e.g. /questions/1/foo/2 → /questions/1/foo). The question id is the identity.",
  },
  {
    id: "stackoverflow:strip-non-answer-fragment",
    description:
      "Non-answer fragments removed. #12345 and #answer-12345 are kept because they name a specific answer; everything else only scrolls the same question page.",
  },

  // ── google docs / drive ───────────────────────────────────────
  {
    id: "google:docs-normalize-edit",
    description:
      "Google Docs URLs normalised to the /edit form and stripped of ?usp= parameters. /view, /preview and /edit all resolve to the same document id.",
  },
  {
    id: "google:drive-normalize-view",
    description:
      "Google Drive file URLs normalised to /file/d/<id>/view and stripped of ?usp= parameters. They point at the same file.",
  },

  // ── arxiv ─────────────────────────────────────────────────────
  {
    id: "arxiv:pdf-to-abs",
    description:
      "arxiv.org/pdf/<id> rewritten to /abs/<id>. Both URLs point at the same paper; /abs is the human-readable landing page.",
  },
  {
    id: "arxiv:strip-pdf-extension",
    description:
      "Trailing .pdf removed from arXiv URLs. arxiv.org/pdf/<id> and arxiv.org/pdf/<id>.pdf serve the same PDF.",
  },
  {
    id: "arxiv:strip-fragment",
    description: "Fragment removed on arXiv URLs. It only anchors within the same paper page.",
  },

  // ── hacker news ───────────────────────────────────────────────
  {
    id: "hackernews:strip-fragment",
    description:
      "Fragment removed on Hacker News item URLs (e.g. #up_43). It anchors an in-page vote button, not a comment or story.",
  },
];

export const RULE_REGISTRY: Readonly<Record<string, CanonicalizationRule>> = Object.freeze(
  Object.fromEntries(RULES.map((r) => [r.id, r])),
);

/**
 * Human-friendly description for a rule id. Falls back to the id
 * itself if the id is not registered — surfaces the fact that a
 * rule was emitted without a description entry, without breaking
 * the UI.
 */
export function ruleDescription(id: string): string {
  return RULE_REGISTRY[id]?.description ?? id;
}
