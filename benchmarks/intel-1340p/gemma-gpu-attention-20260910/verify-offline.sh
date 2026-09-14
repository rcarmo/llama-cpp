#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Reconstruct and verify the retained Iris Xe attention selector and offline evidence without inference","kind":"read-only","weight":"lightweight","role":"entrypoint"}
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
repo=$(git -C "$here" rev-parse --show-toplevel)
(cd "$here"; sha256sum -c checksums.sha256 >/dev/null)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp -a "$here/." "$tmp/"
mkdir -p "$tmp/source/ggml/src/ggml-vulkan" "$tmp/patch"
git -C "$repo" show 4e9740248:ggml/src/ggml-vulkan/ggml-vulkan.cpp > "$tmp/source/ggml/src/ggml-vulkan/ggml-vulkan.cpp"
(cd "$tmp/source"; git apply --check "$here/patch/attention-select.patch"; git apply "$here/patch/attention-select.patch")
cp "$tmp/source/ggml/src/ggml-vulkan/ggml-vulkan.cpp" "$tmp/patch/ggml-vulkan.cpp"
expected=$(bun -e 'const p=await Bun.file(process.argv[1]).json();console.log(p.sources.find(x=>x.path==="patch/ggml-vulkan.cpp").sha256)' "$here/runtime-provenance.json")
printf '%s  %s\n' "$expected" "$tmp/patch/ggml-vulkan.cpp" | sha256sum -c -
bun test "$tmp/dispatch.test.ts" "$tmp/audit.test.ts"
bun "$tmp/audit-results.ts" >/dev/null
for f in "$here"/*-stage.sh "$here/restore.sh"; do bash -n "$f"; done
printf 'PASS checksums, exact selector source reconstruction, four offline tests, raw evidence audit and shell syntax; no inference\n'
