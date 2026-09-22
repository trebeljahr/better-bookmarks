# Better Bookmarks FAQ

## Where is my data stored?

Locally, in your browser, via chrome.storage and IndexedDB. Nothing is uploaded to a server. Chrome's own sync handles cross-device propagation of the underlying bookmarks.

## Is it open source?

Yes — MIT licensed. The full source lives on GitHub.

## Does it work in Firefox?

A Firefox build is available from the GitHub releases page (built with WXT, same codebase). AMO (addons.mozilla.org) submission is pending.

## How do I export my bookmarks?

Open the overview page and use the "Export…" dropdown. JSON (round-trippable — full data including tags, ratings, notes, and connections) or HTML (Netscape bookmarks, importable into Chrome and Firefox). The neighbouring "Import file…" button reads either format back in.

## Will there be a paid tier?

No. Better Bookmarks is free and MIT licensed. There are no plans for a paid version, subscription, or premium features.

## Do you collect any analytics?

No. The extension makes no analytics calls. Only this marketing site uses Plausible — cookieless, no cross-site tracking, no personal data.

## How big a collection does it handle?

It's designed for 20,000+ bookmarks; the maintainer's own corpus is that size and drives the performance work.
