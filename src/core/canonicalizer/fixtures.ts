export type CanonicalizationFixture = {
  name: string;
  input: string;
  expected: string;
};

export type RejectionFixture = {
  name: string;
  input: string;
  reason: "unparseable" | "unbookmarkable-scheme";
};

export const FIXTURES: CanonicalizationFixture[] = [
  {
    name: "strips utm params globally",
    input: "https://example.com/article?utm_source=twitter&utm_medium=social",
    expected: "https://example.com/article",
  },
  {
    name: "strips fbclid",
    input: "https://example.com/post?fbclid=IwAR123",
    expected: "https://example.com/post",
  },
  {
    name: "strips text fragments",
    input: "https://example.com/page#:~:text=highlight",
    expected: "https://example.com/page",
  },
  {
    name: "preserves non-text fragments by default",
    input: "https://example.com/page#section",
    expected: "https://example.com/page#section",
  },
  {
    name: "sorts query params for stable dedup",
    input: "https://example.com/?b=2&a=1",
    expected: "https://example.com/?a=1&b=2",
  },
  {
    name: "lowercases host",
    input: "https://Example.COM/path",
    expected: "https://example.com/path",
  },
  {
    name: "drops default port http",
    input: "http://example.com:80/foo",
    expected: "http://example.com/foo",
  },
  {
    name: "drops default port https",
    input: "https://example.com:443/foo",
    expected: "https://example.com/foo",
  },

  {
    name: "youtube: strips timestamp",
    input: "https://www.youtube.com/watch?v=abc123XYZ_-&t=42s",
    expected: "https://www.youtube.com/watch?v=abc123XYZ_-",
  },
  {
    name: "youtube: strips watch-later list",
    input: "https://www.youtube.com/watch?v=abc123XYZ_-&list=WL",
    expected: "https://www.youtube.com/watch?v=abc123XYZ_-",
  },
  {
    name: "youtube: keeps real playlist list",
    input: "https://www.youtube.com/watch?v=abc123XYZ_-&list=PLabcdef",
    expected: "https://www.youtube.com/watch?list=PLabcdef&v=abc123XYZ_-",
  },
  {
    name: "youtube: youtu.be -> watch?v",
    input: "https://youtu.be/abc123XYZ_-?t=10",
    expected: "https://www.youtube.com/watch?v=abc123XYZ_-",
  },
  {
    name: "youtube: shorts -> watch?v",
    input: "https://www.youtube.com/shorts/abc123XYZ_-",
    expected: "https://www.youtube.com/watch?v=abc123XYZ_-",
  },
  {
    name: "youtube: mobile -> www",
    input: "https://m.youtube.com/watch?v=abc123XYZ_-",
    expected: "https://www.youtube.com/watch?v=abc123XYZ_-",
  },
  {
    name: "youtube: drops si tracking param",
    input: "https://www.youtube.com/watch?v=abc123XYZ_-&si=trackingthing",
    expected: "https://www.youtube.com/watch?v=abc123XYZ_-",
  },

  {
    name: "twitter: drops s param",
    input: "https://twitter.com/user/status/12345?s=20",
    expected: "https://x.com/user/status/12345",
  },
  {
    name: "twitter: rewrites host to x.com",
    input: "https://twitter.com/user/status/12345",
    expected: "https://x.com/user/status/12345",
  },
  {
    name: "twitter: drops t and cxt params",
    input: "https://x.com/user/status/12345?t=abc&cxt=def",
    expected: "https://x.com/user/status/12345",
  },

  {
    name: "reddit: old subdomain -> www",
    input: "https://old.reddit.com/r/programming/comments/abc/title",
    expected: "https://www.reddit.com/r/programming/comments/abc/title",
  },
  {
    name: "reddit: drops share_id",
    input: "https://www.reddit.com/r/programming/comments/abc/title?share_id=xyz",
    expected: "https://www.reddit.com/r/programming/comments/abc/title",
  },

  {
    name: "github: drops trailing slash on repo root",
    input: "https://github.com/user/repo/",
    expected: "https://github.com/user/repo",
  },
  {
    name: "github: keeps issuecomment fragment",
    input: "https://github.com/user/repo/issues/42#issuecomment-12345",
    expected: "https://github.com/user/repo/issues/42#issuecomment-12345",
  },
  {
    name: "github: drops random fragment on issue",
    input: "https://github.com/user/repo/issues/42#header",
    expected: "https://github.com/user/repo/issues/42",
  },
  {
    name: "github: drops tab param on repo root",
    input: "https://github.com/user/repo?tab=readme",
    expected: "https://github.com/user/repo",
  },

  {
    name: "wikipedia: drops section fragment by default",
    input: "https://en.wikipedia.org/wiki/Foo#History",
    expected: "https://en.wikipedia.org/wiki/Foo",
  },

  {
    name: "amazon: collapses to /dp/ASIN",
    input: "https://www.amazon.com/Some-Product-Name/dp/B0ABCDEFGH/ref=sr_1_2?keywords=foo",
    expected: "https://www.amazon.com/dp/B0ABCDEFGH",
  },
  {
    name: "amazon: handles gp/product",
    input: "https://www.amazon.com/gp/product/B0ABCDEFGH?th=1",
    expected: "https://www.amazon.com/dp/B0ABCDEFGH",
  },

  {
    name: "medium: drops source param",
    input: "https://medium.com/@user/post-slug-abc?source=user_profile",
    expected: "https://medium.com/@user/post-slug-abc",
  },
  {
    name: "medium: drops sk param",
    input: "https://medium.com/some-publication/title?sk=abc123",
    expected: "https://medium.com/some-publication/title",
  },

  {
    name: "stackoverflow: drops cruft after slug",
    input: "https://stackoverflow.com/questions/12345/how-to-do-thing/12346",
    expected: "https://stackoverflow.com/questions/12345/how-to-do-thing",
  },
  {
    name: "stackoverflow: preserves answer fragment",
    input: "https://stackoverflow.com/questions/12345/how-to-do-thing#answer-67890",
    expected: "https://stackoverflow.com/questions/12345/how-to-do-thing#answer-67890",
  },

  {
    name: "google docs: normalizes to /edit form",
    input: "https://docs.google.com/document/d/abc_DEF-123/view?usp=sharing",
    expected: "https://docs.google.com/document/d/abc_DEF-123/edit",
  },

  {
    name: "arxiv: pdf -> abs",
    input: "https://arxiv.org/pdf/2401.12345",
    expected: "https://arxiv.org/abs/2401.12345",
  },
  {
    name: "arxiv: drops .pdf extension",
    input: "https://arxiv.org/pdf/2401.12345.pdf",
    expected: "https://arxiv.org/abs/2401.12345",
  },
  {
    // D8: version suffix is part of paper identity, not just render
    // format. `/pdf/…v2` and `/abs/…v2` collapse to `/abs/…v2` — NOT
    // to `/abs/…` — so v1 and v2 remain separate bookmark records.
    name: "arxiv: pdf with version -> abs with version",
    input: "https://arxiv.org/pdf/2401.12345v2",
    expected: "https://arxiv.org/abs/2401.12345v2",
  },
  {
    // D8 (updated): the abs form keeps whatever version tag the URL
    // came in with. Previously this fixture asserted the version was
    // stripped; that was wrong — different versions of the same
    // paper are different content.
    name: "arxiv: keeps version suffix on abs",
    input: "https://arxiv.org/abs/2401.12345v2",
    expected: "https://arxiv.org/abs/2401.12345v2",
  },
  {
    name: "arxiv: keeps version suffix on pdf.pdf",
    input: "https://arxiv.org/pdf/2401.12345v3.pdf",
    expected: "https://arxiv.org/abs/2401.12345v3",
  },

  {
    name: "hackernews: strips fragment",
    input: "https://news.ycombinator.com/item?id=12345#up_12346",
    expected: "https://news.ycombinator.com/item?id=12345",
  },
];

export const REJECTION_FIXTURES: RejectionFixture[] = [
  {
    name: "rejects chrome-extension scheme",
    input: "chrome-extension://abcdef/options.html",
    reason: "unbookmarkable-scheme",
  },
  {
    name: "rejects chrome scheme",
    input: "chrome://settings",
    reason: "unbookmarkable-scheme",
  },
  {
    name: "rejects javascript scheme",
    input: "javascript:void(0)",
    reason: "unbookmarkable-scheme",
  },
  {
    name: "rejects unparseable garbage",
    input: "not a url at all",
    reason: "unparseable",
  },
];
