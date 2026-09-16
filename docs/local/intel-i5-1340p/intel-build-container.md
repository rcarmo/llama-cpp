# Fedora Intel build container on Sigma

`localhost/llama-intel-build:fedora44` is the build environment for native Intel CPU and Vulkan llama.cpp binaries on `sigma`. Compilation runs in rootless Podman. Model inference, Vulkan qualification and service deployment run on the host.

## Tracked recipe

[`tools/Containerfile.intel-1340p`](../../../tools/Containerfile.intel-1340p) starts from `docker.io/library/fedora:44` and installs:

- Clang/LLVM, LLD, GCC and binutils;
- CMake, Ninja, Make, Git and ccache;
- libomp, NUMA, hwloc and `perf` development/runtime support;
- Vulkan headers, loader development files, Mesa Vulkan drivers and Vulkan tools;
- shaderc, `glslc` and SPIR-V headers;
- curl and OpenSSL development files.

The tracked file is the maintained recipe for future image builds. It uses the floating Fedora 44 base and unversioned Fedora packages, so rebuilding it can select newer package objects. Benchmark evidence must record the source commit, Containerfile SHA-256, image ID/digest and installed package versions.

Two rootless stores contained the tag on 16 September 2026:

| Store | Image ID | Digest | Created |
|---|---|---|---|
| Private VFS store used by `tools/build-intel-1340p.sh` | `85cf6fbe2b036bbba59ea14839832c0ae38e587584c27015a90fc92ea6d3a97d` | `sha256:c762e077ecece1e8945b0d5c867d81182a1f6a9b23c46e4c5c11a214703750d9` | `2026-07-30T23:58:02.297227244Z` |
| Default rootless Podman store | `73955bdf70a7b14e89100610502f01d2e4dc231697fd17e785275f538cad6204` | `sha256:85b28c958e8fed406a1256f8500cb36ac1d8cd19cdee664d6f5db462acdc3a8a` | `2026-07-30T23:43:46.625663971Z` |

Both were `linux/amd64` Fedora 44 images and exposed Clang 22.1.8, CMake 4.3.0, Ninja 1.13.2, ccache 4.12.3, libomp 22.1.8 and Vulkan headers 1.4.341.0. Their histories differed in command text and object identity. Record which store supplied a measured build.

The local image histories included the Vulkan and shader packages listed above. This recipe correction adds the package list that the parent tree omitted. The parent recipe could not rebuild a Vulkan-capable image alone. Collect the snapshot with `podman image inspect`, `podman image history --no-trunc` and `rpm -qa` inside each named image.

## Build the image

[`tools/build-intel-1340p.sh`](../../../tools/build-intel-1340p.sh) uses separate VFS storage by default:

```text
PODMAN_STORAGE=/var/home/agent/workspace/projects/.podman-llama-storage
PODMAN_RUNROOT=/var/home/agent/workspace/projects/.podman-llama-run
```

Its private store is independent of the default rootless Podman store. Build and inspect the image in that store from the repository root:

```bash
storage=/var/home/agent/workspace/projects/.podman-llama-storage
runroot=/var/home/agent/workspace/projects/.podman-llama-run

podman --root "$storage" --runroot "$runroot" \
  --storage-driver vfs --cgroup-manager=cgroupfs \
  build --network=host --security-opt label=disable \
  -t localhost/llama-intel-build:fedora44 \
  -f tools/Containerfile.intel-1340p .

podman --root "$storage" --runroot "$runroot" \
  --storage-driver vfs --cgroup-manager=cgroupfs \
  image inspect localhost/llama-intel-build:fedora44 \
  --format 'id={{.Id}} digest={{.Digest}} created={{.Created}}'
sha256sum tools/Containerfile.intel-1340p
```

If the image is absent there, the helper builds it from the tracked Containerfile. Override the image, store or runroot only deliberately:

```bash
LLAMA_BUILD_IMAGE=localhost/llama-intel-build:fedora44 \
PODMAN_STORAGE=/absolute/storage \
PODMAN_RUNROOT=/absolute/runroot \
BUILD_JOBS=2 \
  tools/build-intel-1340p.sh
```

## CPU build helper

The existing helper builds `build-intel-clang` with Vulkan disabled:

```bash
BUILD_JOBS=2 tools/build-intel-1340p.sh
```

It:

1. runs rootless Podman with `--userns=keep-id` so outputs belong to the host user;
2. mounts `/var/home/agent/workspace` at the same absolute path used by CMake;
3. mounts `../.ccache-llama-intel` at `/ccache`, capped at 10 GiB with compression;
4. configures a Clang Release build with `GGML_NATIVE=ON`, AVX-VNNI and OpenMP;
5. builds the CLI, server, benchmark and CPU test targets;
6. runs `test-x86-quant-dot`;
7. copies `libomp.so` into `build-intel-clang/runtime`.

The helper also runs `find ... -newermt now -exec touch` over every repository file except `.git` and `build-intel-clang`. It compares each traversal against the command's current time and normalises files that are still dated in the future. This can change non-source file mtimes. Review unexpected future timestamps before running it when provenance depends on mtimes.

The helper's compile container uses `--network=host`, although the configured CPU build does not normally need network access after the image exists. Use the explicit `--network=none` Vulkan pattern below for bounded candidate builds. Changing the helper's network mode needs a separate tested change because its existing workflows may rely on host access.

The same absolute workspace path matters because CMake caches `CMAKE_HOME_DIRECTORY` and compiler paths. Do not move an existing build directory between a different container mount and the host.

## Vulkan zero-copy build

The current Gemma service uses `build-gemma-zero-copy-vulkan`. Configure and build it inside the same image:

```bash
storage=/var/home/agent/workspace/projects/.podman-llama-storage
runroot=/var/home/agent/workspace/projects/.podman-llama-run

podman --root "$storage" --runroot "$runroot" \
  --storage-driver vfs --cgroup-manager=cgroupfs \
  run --rm \
  --network=none \
  --security-opt label=disable \
  --userns=keep-id \
  -v /var/home/agent/workspace:/var/home/agent/workspace:rw \
  -v /var/home/agent/workspace/projects/.ccache-llama-intel:/ccache:rw \
  -w /var/home/agent/workspace/projects/llama-cpp \
  localhost/llama-intel-build:fedora44 \
  bash -lc '
    set -euo pipefail
    export CCACHE_DIR=/ccache CCACHE_MAXSIZE=10G CCACHE_COMPRESS=1
    cmake -S . -B build-gemma-zero-copy-vulkan -G Ninja \
      -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_C_COMPILER=clang \
      -DCMAKE_CXX_COMPILER=clang++ \
      -DCMAKE_C_COMPILER_LAUNCHER=ccache \
      -DCMAKE_CXX_COMPILER_LAUNCHER=ccache \
      -DBUILD_SHARED_LIBS=ON \
      -DGGML_VULKAN=ON \
      -DGGML_BACKEND_DL=OFF \
      -DGGML_NATIVE=ON \
      -DGGML_OPENMP=ON \
      -DLLAMA_BUILD_TESTS=ON \
      -DLLAMA_BUILD_SERVER=ON \
      -DLLAMA_BUILD_UI=ON
    cmake --build build-gemma-zero-copy-vulkan --target \
      llama-gemma-zero-copy-server llama-gemma-in-memory \
      test-context-handoff test-gemma-hybrid-session-policy -j2
    ctest --test-dir build-gemma-zero-copy-vulkan \
      -R "^test-(gemma-hybrid-session-policy|context-handoff(-gemma)?)$" \
      --output-on-failure
  '
```

Use `--network=none` for an existing image. Image creation needs package-network access; normal compilation does not.

The container is a compiler environment only. Do not pass `/dev/dri` for routine builds. Run Vulkan inference and qualification on the host against the host loader, Intel driver, cgroup and memory/swap controls. A test container may receive `/dev/dri/renderD128` only when the experiment explicitly measures container execution and records that boundary.

## Candidate isolation

Do not overwrite the live build while screening a candidate. Use a separate build directory, for example:

```text
build-gemma-generation-parity
```

Configure it with the same options and image identity as the live build. Record:

- source commit and dirty diff hash;
- image ID, digest and Containerfile hash;
- CMake cache values and compile commands;
- executable and linked-library SHA-256 values;
- copied `libomp.so` identity where a host runtime path supplies it.

Run model-free tests from the candidate directory before any host inference. Start candidate inference on an isolated loopback port under a bounded process group or systemd unit. Keep the current service as the restoration target until deployment succeeds.

## Host runtime boundary

The host may lack Clang, CMake and Ninja even while retained build products remain runnable. This is expected for the immutable Fedora host and is why the container exists. The deployed service loads `libomp.so` from the retained runtime directory through `LD_LIBRARY_PATH`; `ldd` without that environment can report `libomp.so => not found` even when the service resolves it correctly.

Before deployment, inspect the live process rather than assuming the build directory defines runtime identity:

```bash
pid=$(systemctl --user show llama-gemma-zero-copy.service -p MainPID --value)
tr '\0' '\n' < "/proc/$pid/environ" | grep '^LD_LIBRARY_PATH='
sha256sum "/proc/$pid/exe"
grep -E 'lib(llama|ggml|omp)' "/proc/$pid/maps"
```

A successful container build does not authorise a service restart. Deployment still requires matched qualification, a current rollback target and live post-restart checks.
