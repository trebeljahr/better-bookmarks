#!/usr/bin/env bash
# release-dry-run.sh -- build v1.0.0-rc.1 release artifacts and print the
# exact `gh release create` invocation Rico can copy-paste. This script does
# NOT publish the release.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# --- preflight ---------------------------------------------------------------

branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$branch" != "main" ]]; then
  echo "error: expected main branch, on '$branch'" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "error: working tree is not clean" >&2
  git status --short >&2
  exit 1
fi

version="$(node -p "require('./package.json').version")"
tag="v${version}"
notes_file="scripts/release-notes-${tag}.md"

if [[ ! -f "$notes_file" ]]; then
  echo "error: release notes file missing at $notes_file" >&2
  exit 1
fi

# --- build -------------------------------------------------------------------

echo "==> pnpm install --frozen-lockfile"
pnpm install --frozen-lockfile

echo "==> pnpm build"
pnpm build

echo "==> pnpm zip (chromium)"
pnpm zip

echo "==> pnpm zip:firefox"
pnpm zip:firefox

# --- locate artifacts --------------------------------------------------------

chrome_zip="$(find .output -maxdepth 2 -type f -name '*chrome*.zip' ! -name '*sources*' | sort | tail -n1)"
firefox_zip="$(find .output -maxdepth 2 -type f -name '*firefox*.zip' ! -name '*sources*' | sort | tail -n1)"

if [[ -z "$chrome_zip" || ! -f "$chrome_zip" ]]; then
  echo "error: could not find chrome zip under .output" >&2
  exit 1
fi
if [[ -z "$firefox_zip" || ! -f "$firefox_zip" ]]; then
  echo "error: could not find firefox zip under .output" >&2
  exit 1
fi

# --- checksums ---------------------------------------------------------------

chrome_sha="$(shasum -a 256 "$chrome_zip" | awk '{print $1}')"
firefox_sha="$(shasum -a 256 "$firefox_zip" | awk '{print $1}')"

echo
echo "==> artifacts"
echo "  chrome  : $chrome_zip"
echo "  firefox : $firefox_zip"
echo
echo "==> sha256"
echo "  $chrome_sha  $(basename "$chrome_zip")"
echo "  $firefox_sha  $(basename "$firefox_zip")"

# --- gh release command ------------------------------------------------------

echo
echo "==> copy-paste this to publish the draft release:"
echo
cat <<EOF
gh release create $tag \\
  --draft \\
  --prerelease \\
  --title "$tag — first release candidate" \\
  --notes-file $notes_file \\
  "$chrome_zip" \\
  "$firefox_zip"
EOF

echo
echo "This script did NOT run gh release create."
