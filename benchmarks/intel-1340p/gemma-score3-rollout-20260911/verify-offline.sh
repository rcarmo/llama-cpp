#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Verify resumed score3 rollout evidence and fail-closed speech tests without inference","kind":"read-only","weight":"lightweight","role":"entrypoint"}
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
(cd "$here";sha256sum -c checksums.sha256 >/dev/null)
tmp=$(mktemp -d);trap 'rm -rf "$tmp"' EXIT
cp -a "$here/." "$tmp/evidence/"
bun test "$tmp/evidence/audit.test.ts" "$tmp/evidence/speech.test.ts" "$tmp/evidence/guard-safety.test.ts"
bun "$tmp/evidence/audit-results.ts" >/dev/null
printf 'PASS retained qualification, production SSE/cache/identity and stopped-speech guard evidence; no inference\n'
