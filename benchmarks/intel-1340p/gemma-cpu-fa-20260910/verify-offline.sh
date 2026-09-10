#!/usr/bin/env bash
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
repo=$(git -C "$here" rev-parse --show-toplevel)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/build/ggml/src/ggml-cpu" "$tmp/patch" "$tmp/ggml/src/ggml-cpu"
git -C "$repo" show abdbeadfb:ggml/src/ggml-cpu/ops.cpp > "$tmp/build/ggml/src/ggml-cpu/ops.cpp"
cp "$tmp/build/ggml/src/ggml-cpu/ops.cpp" "$tmp/ggml/src/ggml-cpu/ops.cpp"
(cd "$tmp"; git apply "$here/patch/all-experiments.patch")
cp "$tmp/ggml/src/ggml-cpu/ops.cpp" "$tmp/patch/ops.cpp"
cp "$here/state-layout.ts" "$here/state-layout.test.ts" "$here/accumulator.test.ts" "$tmp/"
bun test "$tmp/state-layout.test.ts" "$tmp/accumulator.test.ts"
cp "$tmp/build/ggml/src/ggml-cpu/ops.cpp" "$tmp/ggml/src/ggml-cpu/ops.cpp"
(cd "$tmp"; git apply --check "$here/patch/fused-only.patch"; git apply "$here/patch/fused-only.patch")
cmp "$tmp/ggml/src/ggml-cpu/fa-f16-f32-mad.h" "$here/patch/fa-f16-f32-mad.h"
printf 'PASS standalone patch applies to measured source revision\n'
