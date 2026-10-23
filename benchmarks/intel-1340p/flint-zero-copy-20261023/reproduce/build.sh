#!/bin/bash
set -euo pipefail
ws=/var/home/agent/workspace
run="$ws/tmp/llama-cpp/runs/flint-trial-20261023-be9528654612"
export TMPDIR="$run/tmp" TMP="$run/tmp" TEMP="$run/tmp" BUN_TMPDIR="$run/tmp"
name=flint-build
if podman container exists "$name";then test "$(podman inspect "$name" --format '{{.State.Status}}')" != running;podman rm "$name" >/dev/null;fi
podman run -d --name "$name" --network none --cpus=2 --memory=4g --memory-swap=4g --pids-limit=256 --security-opt label=disable --userns=keep-id -v "$ws:$ws" -w "$ws/projects/llama-cpp" -e WORKSPACE_ROOT="$ws" -e LLAMA_SOURCE_DIR="$run/source" -e BUILD_VARIANT=flint-vulkan -e RUN_PURPOSE=flint-trial -e JOBS=2 -e TMPDIR="$run/tmp" -e TMP="$run/tmp" -e TEMP="$run/tmp" --entrypoint /bin/bash localhost/llama-intel-build:fedora44 -lc "set -e;make agent-configure CMAKE_ARGS='-DGGML_VULKAN=ON -DGGML_CUDA=OFF -DGGML_NATIVE=ON -DLLAMA_OPENSSL=OFF -DLLAMA_CURL=OFF -DLLAMA_BUILD_TESTS=ON -DLLAMA_BUILD_SERVER=OFF -DLLAMA_BUILD_EXAMPLES=OFF' > '$run/configure.log' 2>&1;make agent-build BUILD_ARGS='--target test-flint-handoff-synthetic test-llama-archs test-context-handoff test-vulkan-cpu-view' > '$run/build.log' 2>&1"
