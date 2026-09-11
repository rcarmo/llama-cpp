#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Reconstruct negativeF16paired-dot experiment and verify native trace/timing evidence offline","kind":"read-only","weight":"lightweight","role":"entrypoint"}
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd);repo=$(git -C "$here" rev-parse --show-toplevel)
(cd "$here";sha256sum -c checksums.sha256 >/dev/null)
tmp=$(mktemp -d);trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/ggml/src/ggml-cpu"
git -C "$repo" show abdbeadfb:ggml/src/ggml-cpu/ggml-cpu.c > "$tmp/ggml/src/ggml-cpu/ggml-cpu.c"
(cd "$tmp";git apply --check "$here/patch/f16-pair.patch";git apply "$here/patch/f16-pair.patch")
expected=$(bun -e 'console.log((await Bun.file(process.argv[1]).json()).source_sha256)' "$here/provenance.json")
printf '%s  %s\n' "$expected" "$tmp/ggml/src/ggml-cpu/ggml-cpu.c"|sha256sum -c -
cp -a "$here/." "$tmp/evidence/"
bun test "$tmp/evidence/audit.test.ts"
bun "$tmp/evidence/audit-results.ts" >/dev/null
printf 'PASS pinnedsource,negativepaired-dotresult,n1-onlytracecoverageandrestoration; no inference\n'
