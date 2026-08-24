#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
workspace=$(cd "$root/.." && pwd)
storage=${PODMAN_STORAGE:-$workspace/.podman-llama-storage}
runroot=${PODMAN_RUNROOT:-$workspace/.podman-llama-run}
image=${LLAMA_SYCL_BUILD_IMAGE:-localhost/llama-intel-sycl:oneapi-2025.3.3-l0-1.28.2}
jobs=${BUILD_JOBS:-2}

mkdir -p "$storage" "$runroot" "$workspace/.ccache-llama-sycl"

if ! podman --root "$storage" --runroot "$runroot" --storage-driver vfs --cgroup-manager=cgroupfs image exists "$image"; then
  podman --root "$storage" --runroot "$runroot" --storage-driver vfs --cgroup-manager=cgroupfs \
    build --network=host --security-opt label=disable -t "$image" \
    -f "$root/tools/Containerfile.intel-sycl" "$root"
fi

podman --root "$storage" --runroot "$runroot" --storage-driver vfs --cgroup-manager=cgroupfs \
  run --rm --network=none --security-opt label=disable --userns=keep-id --user "$(id -u):$(id -g)" \
  -v /var/home/agent/workspace:/var/home/agent/workspace \
  -v "$workspace/.ccache-llama-sycl:/ccache" -w "$root" "$image" '
    set -euo pipefail
    # The pinned oneAPI image initializes compiler/library paths in its image
    # environment. Re-sourcing setvars under set -e can return nonzero.
    command -v icpx >/dev/null
    command -v sycl-ls >/dev/null
    export CCACHE_DIR=/ccache CCACHE_MAXSIZE=10G CCACHE_COMPRESS=1
    if [[ -f build-intel-sycl/CMakeCache.txt ]] &&
       ! grep -Fqx "CMAKE_HOME_DIRECTORY:INTERNAL=$PWD" build-intel-sycl/CMakeCache.txt; then
      rm -rf build-intel-sycl
    fi
    cmake -S . -B build-intel-sycl -G Ninja \
      -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_C_COMPILER=icx -DCMAKE_CXX_COMPILER=icpx \
      -DCMAKE_C_COMPILER_LAUNCHER=ccache -DCMAKE_CXX_COMPILER_LAUNCHER=ccache \
      -DGGML_NATIVE=OFF \
      -DGGML_SYCL=ON -DGGML_SYCL_F16=ON -DGGML_SYCL_TARGET=INTEL \
      -DGGML_SYCL_DNN=ON -DDNNL_DIR=/opt/intel/oneapi/2025.3/lib/cmake/dnnl -DGGML_SYCL_GRAPH=ON \
      -DGGML_SYCL_HOST_MEM_FALLBACK=ON -DGGML_SYCL_SUPPORT_LEVEL_ZERO_API=ON \
      -DGGML_BACKEND_DL=ON -DGGML_CPU_ALL_VARIANTS=ON \
      -DLLAMA_BUILD_TESTS=ON -DLLAMA_BUILD_SERVER=ON -DLLAMA_BUILD_UI=OFF
    cmake --build build-intel-sycl --target \
      llama-cli llama-server llama-bench test-backend-ops -j '"$jobs"'
    mkdir -p build-intel-sycl/runtime
    find /opt/intel/oneapi -type f \( -name "libsycl.so*" -o -name "libOpenCL.so*" -o -name "libmkl_sycl.so*" -o -name "libdnnl.so*" \) -exec cp -P {} build-intel-sycl/runtime/ \; 2>/dev/null || true
    cp -P /usr/lib/x86_64-linux-gnu/libze_loader.so* build-intel-sycl/runtime/ 2>/dev/null || true
  '

for binary in llama-cli llama-server llama-bench test-backend-ops; do
  test -s "$root/build-intel-sycl/bin/$binary" || { echo "invalid SYCL artifact: $binary" >&2; exit 1; }
done
printf 'build=%s\nimage=%s\n' "$root/build-intel-sycl" "$image"
