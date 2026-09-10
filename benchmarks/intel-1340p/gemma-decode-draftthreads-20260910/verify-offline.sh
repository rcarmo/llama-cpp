#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Verify independentdraftthreads rawcounterbalanced evidence and restoration offline","kind":"read-only","weight":"lightweight","role":"entrypoint"}
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
(cd "$here";sha256sum -c checksums.sha256 >/dev/null)
tmp=$(mktemp -d);trap 'rm -rf "$tmp"' EXIT
cp -a "$here/." "$tmp/"
bun test "$tmp/audit.test.ts"
bun "$tmp/audit-results.ts" >/dev/null
printf 'PASS matchedwork,independentfactor,resource/identity/restorationchecks; no inference\n'
