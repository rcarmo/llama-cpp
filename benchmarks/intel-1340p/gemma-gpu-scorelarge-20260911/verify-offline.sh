#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Verify large-score native/screen evidence without GPU execution","kind":"read-only","weight":"lightweight","role":"entrypoint"}
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
(cd "$here";sha256sum -c checksums.sha256 >/dev/null)
bun test "$here/audit.test.ts" "$here/dispatch.test.ts"
echo 'PASS native actual128tile and rejected48Kscreen; no inference'
