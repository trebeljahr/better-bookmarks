# Local API access

Set `BB_API_TOKEN` to a random secret of at least 32 characters before `bb serve`.
Keep it in a private local environment, never a URL or committed configuration.
Every request needs `Authorization: Bearer <token>`, including health checks.
For browser clients, set `BB_API_ORIGINS` to exact comma-separated origins, such as
the installed extension's `chrome-extension://<id>` origin. No origins are allowed
by default. Non-browser callers may omit Origin but still need the token.

The API binds only to loopback, verifies Host against the listening port, accepts
up to 2 MiB of uncompressed JSON and 500 bookmarks per ingest request. Split larger
imports into batches. Search queries are limited to 4096 characters.

The shipped extension currently has no HTTP RAG integration; its in-browser search
is unchanged. Future integration must store the token locally and send the header.
CORS preflight is allowed only for configured origins and does not expose API data.
