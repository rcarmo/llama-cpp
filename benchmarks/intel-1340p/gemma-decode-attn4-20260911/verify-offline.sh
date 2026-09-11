#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Reconstruct four-query tile and verify saved numerical/timing/deployment evidence offline","kind":"read-only","weight":"lightweight","role":"entrypoint"}
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd);repo=$(git -C "$here" rev-parse --show-toplevel)
(cd "$here";sha256sum -c checksums.sha256 >/dev/null)
tmp=$(mktemp -d);trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/ggml/src/ggml-cpu/llamafile"
git -C "$repo" show abdbeadfb:ggml/src/ggml-cpu/llamafile/sgemm.cpp > "$tmp/ggml/src/ggml-cpu/llamafile/sgemm.cpp"
(cd "$tmp";git apply --check "$here/patch/attn4.patch";git apply "$here/patch/attn4.patch")
expected=$(bun -e 'console.log((await Bun.file(process.argv[1]).json()).source_sha256)' "$here/provenance.json")
printf '%s  %s\n' "$expected" "$tmp/ggml/src/ggml-cpu/llamafile/sgemm.cpp"|sha256sum -c -
cp -a "$here/." "$tmp/evidence/"
bun test "$tmp/evidence/audit.test.ts" "$tmp/evidence/dispatch.test.ts"
bun "$tmp/evidence/audit-results.ts" >/dev/null
printf 'PASS pinned source, native n4 coverage, saved timing, finite/tool/cache qualification and rollout evidence; no inference\n'
