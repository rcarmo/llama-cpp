#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Verify register-assigned score source, assembly and raw evidence without inference","kind":"read-only","weight":"lightweight","role":"entrypoint"}
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
(cd "$here";sha256sum -c checksums.sha256 >/dev/null)
tmp=$(mktemp -d);trap 'rm -rf "$tmp"' EXIT
cp "$here/patch/sgemm-parent.cpp" "$tmp/sgemm.cpp"
(cd "$tmp";git apply --check "$here/patch/registers.patch";git apply "$here/patch/registers.patch")
cmp "$tmp/sgemm.cpp" "$here/patch/sgemm.cpp"
bun test "$here/helper.test.ts" "$here/audit.test.ts"
echo 'PASS exact patch, spill-free instruction loop, native/probe/screen and restored B0; no inference'
