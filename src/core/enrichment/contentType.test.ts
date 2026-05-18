import { describe, expect, it } from "vitest";
import { detectContentType } from "./contentType";

describe("detectContentType", () => {
  const cases: Array<[string, ReturnType<typeof detectContentType>]> = [
    ["https://github.com/user/repo", "repo"],
    ["https://github.com/user/repo/issues/42", "repo"],
    ["https://gist.github.com/user/abc", "repo"],
    ["https://gitlab.com/user/repo", "repo"],
    ["https://www.npmjs.com/package/dexie", "library"],
    ["https://pypi.org/project/requests/", "library"],
    ["https://crates.io/crates/serde", "library"],
    ["https://arxiv.org/abs/2401.12345", "paper"],
    ["https://pubmed.ncbi.nlm.nih.gov/12345/", "paper"],
    ["https://www.youtube.com/watch?v=abc", "video"],
    ["https://youtu.be/abc", "video"],
    ["https://www.vimeo.com/12345", "video"],
    ["https://www.twitch.tv/streamer", "video"],
    ["https://open.spotify.com/episode/abc", "podcast"],
    ["https://podcasts.apple.com/us/podcast/abc/id123", "podcast"],
    ["https://www.goodreads.com/book/show/12345", "book"],
    ["https://www.reddit.com/r/programming/comments/abc/title/", "thread"],
    ["https://x.com/user/status/12345", "thread"],
    ["https://news.ycombinator.com/item?id=12345", "thread"],
    ["https://lobste.rs/s/abc/title", "thread"],
    ["https://www.coursera.org/learn/something", "course"],
    ["https://developer.mozilla.org/en-US/docs/Web/CSS", "reference"],
    ["https://docs.python.org/3/library/asyncio.html", "reference"],
    ["https://docs.dexie.org/Tutorial/Intro", "reference"],
    ["https://en.wikipedia.org/wiki/Bookmark", "article"],
    ["https://medium.com/@user/post", "article"],
    ["https://user.substack.com/p/title", "article"],
    ["https://example.com/random", "unknown"],
    ["not-a-url", "unknown"],
  ];

  for (const [url, expected] of cases) {
    it(`${url} -> ${expected}`, () => {
      expect(detectContentType(url)).toBe(expected);
    });
  }
});
