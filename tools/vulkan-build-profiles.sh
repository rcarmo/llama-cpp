#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
# shellcheck source=/dev/null
source "$root/tools/vulkan-toolchain-env.sh"

profile=${1:-}
mode=${2:-configure-only}
jobs=${VULKAN_BUILD_JOBS:-2}

common=(
  -DCMAKE_BUILD_TYPE=Release
  -DLLAMA_BUILD_TESTS=ON
  -DLLAMA_BUILD_SERVER=ON
  -DLLAMA_BUILD_UI=OFF
  -DGGML_VULKAN=ON
  -DGGML_CUDA=OFF
)

case "$profile" in
  release)
    build="$root/build-vulkan-release"
    opts=()
    ;;
  release-unroll8)
    build="$root/build-vulkan-release-unroll8"
    opts=(-DGGML_VULKAN_MMVQ_UNROLL=8)
    ;;
  validation)
    build="$root/build-vulkan-validation"
    opts=(
      -DCMAKE_BUILD_TYPE=RelWithDebInfo
      -DGGML_VULKAN_CHECK_RESULTS=ON
      -DGGML_VULKAN_VALIDATE=ON
      -DGGML_VULKAN_RUN_TESTS=ON
    )
    ;;
  multi)
    build="$root/build-vulkan-multi"
    opts=(
      -DGGML_CUDA=ON
      -DCMAKE_CUDA_COMPILER=/usr/local/cuda-12.8/bin/nvcc
    )
    ;;
  *)
    echo "usage: $0 {release|release-unroll8|validation|multi} [configure-only|build]" >&2
    exit 2
    ;;
esac

cmake -S "$root" -B "$build" "${common[@]}" "${opts[@]}"

if [[ "$mode" == build ]]; then
  cmake --build "$build" --target llama-bench test-backend-ops llama-server -j "$jobs"
elif [[ "$mode" != configure-only ]]; then
  echo "unknown mode: $mode" >&2
  exit 2
fi

printf 'profile=%s\nbuild=%s\njobs=%s\n' "$profile" "$build" "$jobs"
