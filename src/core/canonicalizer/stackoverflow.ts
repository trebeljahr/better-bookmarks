import type { DomainStrategy } from "./index";

const QUESTION_PATTERN = /^(\/questions\/\d+\/[^/]+)(?:\/.*)?$/;
const ANSWER_FRAGMENT = /^#(\d+|answer-\d+)$/;

export const stackoverflow: DomainStrategy = (url, ctx) => {
  const match = url.pathname.match(QUESTION_PATTERN);
  if (match) {
    url.pathname = match[1];
  }

  if (!ctx.keepFragments && url.hash && !ANSWER_FRAGMENT.test(url.hash)) {
    url.hash = "";
  }

  return url;
};
