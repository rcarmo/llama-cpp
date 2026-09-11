#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Verify staticcap/position evidence and reconstruct pinned context source without inference","kind":"read-only","weight":"lightweight","role":"entrypoint"}
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd);repo=$(git -C "$here" rev-parse --show-toplevel)
(cd "$here";sha256sum -c checksums.sha256 >/dev/null)
tmp=$(mktemp -d);trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/src"
git -C "$repo" show 4e9740248:src/llama-context.cpp > "$tmp/src/llama-context.cpp"
(cd "$tmp";git apply --check "$here/patch/prefill-cap.patch";git apply "$here/patch/prefill-cap.patch")
expected=$(bun -e 'console.log((await Bun.file(process.argv[1]).json()).candidate_source_sha256)' "$here/source-provenance.json")
printf '%s  %s\n' "$expected" "$tmp/src/llama-context.cpp" | sha256sum -c -
bun test "$here/cap.test.ts"
echo 'PASS staticcap/finitehandoff/allocation and identical-prefix position screens; no inferred whole-prefill gain'
