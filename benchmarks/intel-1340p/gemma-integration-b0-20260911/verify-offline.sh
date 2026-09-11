#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Verify exported integration evidence and tests without inference or service actions","kind":"read-only","weight":"lightweight","role":"entrypoint"}
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
(cd "$here"; sha256sum -c checksums.sha256 >/dev/null)
bun test "$here/audit.test.ts" "$here/closeout.test.ts" "$here/code"
echo 'PASS B0 recovery, dual64K, bounded near128 failure, provenance and final restoration; no inference'
