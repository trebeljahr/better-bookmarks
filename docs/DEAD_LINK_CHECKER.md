# Dead-link checker

Background sweep that checks whether URLs the user has bookmarked still
exist. Lives in `src/core/maintenance/deadLinkChecker.ts` and is called
from `entrypoints/background.ts` on the `dead-link` alarm and from the
Health page's "Scan broken links" button.

The design goal is **conservative flagging**: it is worse to falsely
call a live URL "dead" than to leave a dead URL uncalled for one more
sweep. The user's bookmarks are load-bearing to them; a wrong "this is
broken, delete it?" nudge destroys trust.

## What each response class means

Every HEAD probe is classified into one of three outcomes.

| Probe result           | Status    | Retried? | Written to failure log | Can flip `ok=false`? |
| ---------------------- | --------- | -------- | ---------------------- | -------------------- |
| 2xx                    | `alive`   | no       | no (log is cleared)    | never                |
| 3xx (surfaced)         | `alive`   | no       | no                     | never                |
| **404**                | `dead`    | no       | yes (`status:"dead"`)  | yes, at threshold    |
| **410**                | `dead`    | no       | yes (`status:"dead"`)  | yes, at threshold    |
| **429** (rate-limited) | `unknown` | **yes**  | yes (`status:"unknown"`)| yes, at threshold   |
| **5xx** (500, 503, …)  | `unknown` | **yes**  | yes (`status:"unknown"`)| yes, at threshold   |
| Other 4xx (401, 403, 451, …) | `unknown` | no | yes (`status:"unknown"`)| yes, at threshold  |
| Network error          | `unknown` | **yes**  | yes (`status:"unknown"`)| yes, at threshold   |
| Timeout                | `unknown` | **yes**  | yes (`status:"unknown"`)| yes, at threshold   |

Key rules:

- **429 and 5xx are never treated as dead in a single probe.** They are
  transient, so we retry them and — even if all retries fail — the
  bookmark's `linkCheck.ok` stays `true`. Only the multi-day threshold
  (below) can flip the flag.
- **Non-{404, 410} responses are "unknown", not "dead".** A 403 could be
  a paywall or CDN block; a 401 could be an auth wall the user *wants*
  to keep. We record the probe but do not surface it as broken.
- **Redirects are followed** (`redirect: "follow"`). If the final
  response is 2xx we call it alive.

## Retry policy

Transient outcomes (429, 5xx, network, timeout) trigger up to
**3 retries** with **exponential backoff, base 1000 ms**:

- Retry 1 after 1000 ms
- Retry 2 after 2000 ms
- Retry 3 after 4000 ms

Permanent-looking outcomes (404, 410, other 4xx) are not retried —
retrying an authoritative "gone" answer just burns time and quota.

Alive is short-circuited: the first 2xx/3xx wins and we stop.

Retry counts and delays are configurable via `checkBookmark`'s and
`runDeadLinkSweep`'s `opts` (`maxRetries`, `baseBackoffMs`, `sleep`) for
testing. Production callers pass no options and get the defaults.

## Consecutive-day threshold

Even after retries, a single failing probe never confirms dead. A
bookmark is only marked dead (`linkCheck.ok = false`) after
**`CONSECUTIVE_DAY_THRESHOLD` = 3** failing probes across **three
distinct calendar days (UTC)**.

Each bookmark keeps a per-URL `failureLog` of recent failing probes
(capped at 20 entries). Days are counted by UTC-day bucket. Repeated
failures on the same day only count as one day. A single successful
probe **wipes the log** and resets the counter — a URL that recovers
stops being "on the way to dead".

Practical outcomes:

- URL 500s all day and recovers the next morning → never flagged.
- Domain rate-limits us for a day (429) then works → never flagged.
- User's laptop is offline during the sweep → never flagged.
- URL returns 404 for three consecutive daily sweeps → **flagged dead
  on day three's sweep**.
- URL returns 404 Monday, 500 Tuesday, times out Wednesday → **flagged
  dead Wednesday**. The failure types don't have to match, only the
  distinct-day count matters.

Because sweeps run every ~6 h against bookmarks stale for 30 days by
default (`deadLinkStaleAfterDays`), most bookmarks are probed once per
sweep cycle rather than continuously — the "three distinct days" gate
naturally spans real calendar time and is not defeated by burst
retries.

## Per-bookmark failure log

`LinkCheckResult.failureLog` (see `src/shared/types.ts`) stores each
failing probe as `{ at, status, httpStatus?, reason? }`. The log is:

- Appended on every failing probe (retries within a single check
  contribute **one** entry, the final one).
- Cleared on the first alive probe.
- Bounded to the last 20 entries.
- Persisted with the bookmark in Dexie (no separate table).

`consecutiveFailureDays`, `firstFailureAt`, and `lastFailureAt` are
derived and stored alongside for cheap reads on the Health page.

## Downstream surfaces

- `listDeadBookmarks()` returns bookmarks with `linkCheck.ok === false`
  — i.e. confirmed dead only.
- The `anomaly.broken-link` Health scanner
  (`src/core/health/scanners/brokenLink.ts`) reads the same
  `ok === false` flag. Because that flag now requires the day
  threshold, the scanner never nags the user about a URL that had a
  bad day.
- The `SweepResult` returned by `runDeadLinkSweep` breaks out
  `{ checked, dead, alive, unknown }` so the background alarm and the
  Health UI can distinguish "we saw 12 transient failures" from "we
  confirmed 12 dead URLs".

## Testing

All response classes (200, 301, 404, 410, 429, 500, 503, network-error,
timeout, other 4xx) are covered by unit tests in
`src/core/maintenance/deadLinkChecker.test.ts`. The suite also asserts:

- Exponential backoff schedule (1000 / 2000 / 4000 ms) on 429 and 5xx.
- 3 retries then stop.
- A successful retry short-circuits and records no failure entry.
- Multi-day accounting: 3 distinct days flips `ok=false`; same-day
  failures do not.
- A single alive probe clears the failure log.

`fetch` is mocked throughout — no live network is touched.

## Privacy note

This checker is the extension's single largest source of outbound
network activity. See [PRIVACY.md](PRIVACY.md) §1 for the disclosure.
The retry and threshold policy above increases the request count in
the worst case (up to 4 requests per probed bookmark on the day of a
transient failure), so users who care can turn the sweep off entirely
via **Options → Dead-link checking**
(`settings.deadLinkCheckEnabled = false`).
