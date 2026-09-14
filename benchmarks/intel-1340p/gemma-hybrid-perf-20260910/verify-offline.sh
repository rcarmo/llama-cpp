#!/usr/bin/env bash
# Reconstruct excluded source copies in a temporary tree before source-invariant tests.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
repo=$(git -C "$here" rev-parse --show-toplevel)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/ggml/src/ggml-vulkan" "$tmp/src" "$tmp/splitk" "$tmp/patch"
git -C "$repo" show 4e9740248:ggml/src/ggml-vulkan/ggml-vulkan.cpp > "$tmp/ggml/src/ggml-vulkan/ggml-vulkan.cpp"
git -C "$repo" show 4e9740248:src/llama-kv-cache.cpp > "$tmp/src/llama-kv-cache.cpp"
(cd "$tmp"; git apply "$here/splitk/attention-split-k.patch"; git apply "$here/patch/bounded-swa-export.patch")
cp "$tmp/ggml/src/ggml-vulkan/ggml-vulkan.cpp" "$tmp/splitk/ggml-vulkan.cpp"
cp "$tmp/src/llama-kv-cache.cpp" "$tmp/patch/llama-kv-cache.cpp"
cp "$here/splitk.test.ts" "$here/state-layout.ts" "$here/state-layout.test.ts" "$tmp/"
bun test "$tmp/splitk.test.ts" "$tmp/state-layout.test.ts"
