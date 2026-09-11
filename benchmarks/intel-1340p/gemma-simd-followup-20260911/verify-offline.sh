#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Verify SIMD candidate source reconstruction and retained raw evidence without inference","kind":"read-only","weight":"lightweight","role":"entrypoint"}
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
(cd "$here";sha256sum -c checksums.sha256 >/dev/null)
tmp=$(mktemp -d);trap 'rm -rf "$tmp"' EXIT
cp "$here/patch/sgemm-parent.cpp" "$tmp/sgemm.cpp"
cp "$here/patch/repack-parent.cpp" "$tmp/repack.cpp"
(cd "$tmp";git apply --check "$here/patch/candidates.patch";git apply "$here/patch/candidates.patch";git apply --check "$here/patch/packed.patch";git apply "$here/patch/packed.patch")
cmp "$tmp/sgemm.cpp" "$here/patch/sgemm.cpp"
cmp "$tmp/repack.cpp" "$here/patch/repack.cpp"
bun test "$here/preflight.test.ts" "$here/audit.test.ts"
echo 'PASS exact patches, native/actual dispatch, rejected matched screens and B0 restoration; no inference'
