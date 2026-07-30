#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
workspace=$(cd "$root/.." && pwd)
storage=${PODMAN_STORAGE:-$workspace/.podman-llama-storage}
runroot=${PODMAN_RUNROOT:-$workspace/.podman-llama-run}
image=${LLAMA_BUILD_IMAGE:-localhost/llama-intel-build:fedora44}
jobs=${BUILD_JOBS:-8}

mkdir -p "$storage" "$runroot" "$workspace/.ccache-llama-intel"

if ! podman --root "$storage" --runroot "$runroot" --storage-driver vfs --cgroup-manager=cgroupfs \
    image exists "$image"; then
  podman --root "$storage" --runroot "$runroot" --storage-driver vfs --cgroup-manager=cgroupfs \
    build --network=host --security-opt label=disable \
    -t "$image" -f "$root/tools/Containerfile.intel-1340p" "$root"
fi

podman --root "$storage" --runroot "$runroot" --storage-driver vfs --cgroup-manager=cgroupfs \
  run --rm --network=host --security-opt label=disable --userns=keep-id \
  -v "$(dirname "$workspace"):/var/home/agent/workspace" \
  -v "$workspace/.ccache-llama-intel:/ccache" -w "$root" "$image" bash -lc '
    set -euo pipefail
    export CCACHE_DIR=/ccache CCACHE_MAXSIZE=10G CCACHE_COMPRESS=1
    find . -path ./.git -prune -o -path ./build-intel-clang -prune -o -type f -newermt now -exec touch {} +
    if [[ -f build-intel-clang/CMakeCache.txt ]] &&
       ! grep -Fqx "CMAKE_HOME_DIRECTORY:INTERNAL=$PWD" build-intel-clang/CMakeCache.txt; then
      rm -rf build-intel-clang
    fi
    cmake -S . -B build-intel-clang -G Ninja \
      -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_C_COMPILER=clang -DCMAKE_CXX_COMPILER=clang++ \
      -DCMAKE_C_COMPILER_LAUNCHER=ccache -DCMAKE_CXX_COMPILER_LAUNCHER=ccache \
      -DGGML_NATIVE=ON -DGGML_AVX_VNNI=ON -DGGML_OPENMP=ON \
      -DGGML_VULKAN=OFF \
      -DLLAMA_BUILD_TESTS=ON -DLLAMA_BUILD_SERVER=ON -DLLAMA_BUILD_UI=OFF
    cmake --build build-intel-clang \
      --target llama-cli llama-server llama-bench test-x86-quant-dot test-backend-ops \
      -j '"$jobs"'
    build-intel-clang/bin/test-x86-quant-dot
    mkdir -p build-intel-clang/runtime
    cp -L /usr/lib64/libomp.so build-intel-clang/runtime/libomp.so
  '

for binary in llama-cli llama-server llama-bench test-x86-quant-dot; do
  test -s "$root/build-intel-clang/bin/$binary" || { echo "invalid artifact: $binary" >&2; exit 1; }
done
printf 'build=%s\n' "$root/build-intel-clang"
