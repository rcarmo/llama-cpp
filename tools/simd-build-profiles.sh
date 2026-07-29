#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
profile=${1:-}

case "$profile" in
  avx2)
    build="$root/build-simd-avx2"
    opts=(-DGGML_NATIVE=OFF -DGGML_AVX=ON -DGGML_AVX2=ON -DGGML_FMA=ON -DGGML_F16C=ON -DGGML_AVX_VNNI=OFF)
    ;;
  avx2-vnni)
    build="$root/build-simd-avx2-vnni"
    opts=(-DGGML_NATIVE=OFF -DGGML_AVX=ON -DGGML_AVX2=ON -DGGML_FMA=ON -DGGML_F16C=ON -DGGML_AVX_VNNI=ON)
    ;;
  native)
    build="$root/build-simd-native"
    opts=(-DGGML_NATIVE=ON -DGGML_AVX_VNNI=OFF)
    ;;
  dispatch)
    build="$root/build-simd-dispatch"
    opts=(-DGGML_NATIVE=OFF -DGGML_BACKEND_DL=ON -DGGML_CPU_ALL_VARIANTS=ON -DBUILD_SHARED_LIBS=ON)
    ;;
  *)
    echo "usage: $0 {avx2|avx2-vnni|native|dispatch} [configure-only|build]" >&2
    exit 2
    ;;
esac

mode=${2:-configure-only}
cmake -S "$root" -B "$build" \
  -DCMAKE_BUILD_TYPE=Release \
  -DLLAMA_BUILD_TESTS=ON \
  -DLLAMA_BUILD_SERVER=OFF \
  -DLLAMA_BUILD_UI=OFF \
  -DGGML_CUDA=OFF \
  "${opts[@]}"

if [[ "$mode" == build ]]; then
  cmake --build "$build" --target test-x86-quant-dot test-quantize-perf llama-bench -j "${SIMD_BUILD_JOBS:-2}"
elif [[ "$mode" != configure-only ]]; then
  echo "unknown mode: $mode" >&2
  exit 2
fi

printf 'profile=%s\nbuild=%s\n' "$profile" "$build"
