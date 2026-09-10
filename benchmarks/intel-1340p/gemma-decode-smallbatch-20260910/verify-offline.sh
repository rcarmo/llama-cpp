#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Reconstruct retained CPU smallbatch patch and verify decode/prefill/lifecycle/production evidence offline","kind":"read-only","weight":"lightweight","role":"entrypoint"}
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
repo=$(git -C "$here" rev-parse --show-toplevel)
(cd "$here"; sha256sum -c checksums.sha256 >/dev/null)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp -a "$here/." "$tmp/"
mkdir -p "$tmp/source/src" "$tmp/patch"
git -C "$repo" show abdbeadfb:src/llama-context.cpp > "$tmp/source/src/llama-context.cpp"
(cd "$tmp/source"; git apply --check "$here/patch/small-target-batch.patch"; git apply "$here/patch/small-target-batch.patch")
cp "$tmp/source/src/llama-context.cpp" "$tmp/patch/llama-context.cpp"
expected=$(bun -e 'const p=await Bun.file(process.argv[1]).json();console.log(p.source_sha256)' "$here/runtime-provenance.json")
printf '%s  %s\n' "$expected" "$tmp/patch/llama-context.cpp" | sha256sum -c -
bun test "$tmp/dispatch.test.ts" "$tmp/audit.test.ts"
bun "$tmp/audit-results.ts" >/dev/null
printf 'PASS hashes, exact retained-source reconstruction,3tests/21assertions and rawdecode/prefill/lifecycle/production audit; no inference\n'
