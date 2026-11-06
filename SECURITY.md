# Security policy

## Supported versions

Only the newest release and the current `main` branch get security fixes.
There are no maintenance branches.

## Reporting a vulnerability

Please do not open a public issue for a security problem. Email
<hello@trebeljahr.com> with:

- what an attacker can do, and what they need first (a malicious page, a crafted import file, another extension);
- the extension version from `chrome://extensions` and the Chrome version from `chrome://version`;
- steps or a file that reproduces it.

Better Bookmarks has no server and no account, so most reports concern the
extension pages, import parsing, or the optional network features listed in
[docs/PRIVACY.md](docs/PRIVACY.md).
