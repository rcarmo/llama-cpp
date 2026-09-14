#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Recompute stored64Kdecodeprofile and independenttargetbatchscreen without inference","kind":"read-only","weight":"lightweight","role":"entrypoint"}
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
(cd "$here";sha256sum -c checksums.sha256 >/dev/null)
tmp=$(mktemp -d);trap 'rm -rf "$tmp"' EXIT
cp -a "$here/." "$tmp/"
bun test "$tmp/audit.test.ts"
bun "$tmp/audit-results.ts" >/dev/null
printf 'PASS rawprofilephases,8runthreadisolation and recordedresourcechecks; no inference\n'
