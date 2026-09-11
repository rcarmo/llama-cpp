#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Verify exported save repair, operator instrumentation and bounded release-hold evidence without inference","kind":"read-only","weight":"lightweight","role":"entrypoint"}
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
(cd "$here";sha256sum -c checksums.sha256 >/dev/null)
tmp=$(mktemp -d);trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/src" "$tmp/ggml/src/ggml-cpu"
cp "$here/patch/llama-kv-cache-parent.cpp" "$tmp/src/llama-kv-cache.cpp"
cp "$here/patch/ggml-cpu-parent.c" "$tmp/ggml/src/ggml-cpu/ggml-cpu.c"
# A real temporary Git root prevents discovery of the caller's repository.
git -C "$tmp" init -q
for patch in cpu-save-padding operator-meter;do git -C "$tmp" apply --check "$here/patch/$patch.patch";git -C "$tmp" apply "$here/patch/$patch.patch";done
cmp "$tmp/src/llama-kv-cache.cpp" "$here/patch/llama-kv-cache.cpp"
cmp "$tmp/ggml/src/ggml-cpu/ggml-cpu.c" "$here/patch/ggml-cpu.c"
bun test "$here/stage-owner.test.ts" "$here/closeout.test.ts"
echo 'PASS source reconstruction, manifest, finite/common-state receipts, held-release gates, operator diagnostics and restored B0; no inference'
