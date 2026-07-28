#!/usr/bin/env bash
set -euo pipefail

build=${1:?usage: $0 BUILD_DIR}
lib="$build/bin/libggml-cpu.so"
cache="$build/CMakeCache.txt"

printf 'build=%s\n' "$build"
grep -E '^(CMAKE_BUILD_TYPE|GGML_NATIVE|GGML_AVX:|GGML_AVX2|GGML_FMA|GGML_F16C|GGML_AVX_VNNI):' "$cache" | sort

flags=$(find "$build" -path '*ggml-cpu.dir/flags.make' -print -quit)
if [[ -n "$flags" ]]; then
  grep -E '^(C_FLAGS|CXX_FLAGS|C_DEFINES|CXX_DEFINES) =' "$flags"
fi

if [[ -f "$lib" ]]; then
  for symbol in ggml_vec_dot_q4_0_q8_0 ggml_vec_dot_q5_0_q8_0 ggml_vec_dot_q8_0_q8_0; do
    printf '\n[%s]\n' "$symbol"
    objdump -d -M intel --disassemble="$symbol" "$lib" |
      grep -E 'vpdpbusd|vpdpbssd|vpmaddubsw|vpmaddwd|vpsignb|vfmadd' || true
  done
else
  echo "library not built: $lib" >&2
fi
