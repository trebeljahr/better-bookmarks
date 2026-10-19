The first public release of Better Bookmarks. This is the same build that
is in Chrome Web Store review right now. If you don't want to wait for the
store, you can load it by hand today.

Save the same article from a tweet and from a newsletter, and you get one
bookmark, not two. Put any number of tags on a bookmark, and find it again among
20,000 others. Your bookmarks stay in your browser. There is no account
and no server.

## Changes since 1.0.0-rc.1

- Chrome no longer asks for access to every website when you install. The
  dead-link check and the title and description fetch ask for that access
  when you turn them on in Options. Both are off by default.
- Removed the `activeTab` permission. No code used it.
- Removed the `huggingface.co` host permission. The on-device search model
  still downloads without it.
- Websites can no longer load the extension's search-model runtime files.

The full history is in [CHANGELOG.md](https://github.com/trebeljahr/better-bookmarks/blob/main/CHANGELOG.md).

## Install

**Chrome, Edge, Brave (`better-bookmarks-1.0-chrome.zip`)**

1. Unzip the archive.
2. Open `chrome://extensions`.
3. Turn on Developer mode (top right).
4. Click Load unpacked and pick the unzipped folder.

A Firefox build follows after it passes testing in Firefox.

SHA-256:

```
c113482e02e11e3f77a4e43106a98c43d88c646d28f588fa1c2f3b590929c7cf  better-bookmarks-1.0-chrome.zip
```

Found a bug? [Open an issue](https://github.com/trebeljahr/better-bookmarks/issues/new?template=bug-report.yml).
