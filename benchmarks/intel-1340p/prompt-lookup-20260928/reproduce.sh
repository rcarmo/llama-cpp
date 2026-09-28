#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Run a Gemma vocabulary-only n-gram cache test in the isolated Intel build image","kind":"mixed","weight":"standard","role":"entrypoint"}
set -euo pipefail
repo=$(git rev-parse --show-toplevel)
model="$repo/../models/gemma-4-e4b-qat-mtp/gemma-4-E4B_q4_0-it.gguf"
image=localhost/llama-intel-build:fedora44
podman run --rm --network none --security-opt label=disable --userns=keep-id \
    --cpus=4 --memory=5g --memory-swap=5g --pids-limit=128 \
    -v "$repo:$repo" -v "$model:/models/gemma.gguf:ro" -w "$repo" "$image" bash -lc '
        set -euo pipefail
        cmake -S . -B build-prompt-lookup-main -G Ninja -DCMAKE_BUILD_TYPE=Release -DLLAMA_BUILD_TESTS=ON -DGGML_VULKAN=OFF -DGGML_CUDA=OFF -DGGML_NATIVE=ON -DGGML_BACKEND_DL=OFF
        cmake --build build-prompt-lookup-main --target test-ngram-cache llama-lookup-create llama-lookup-stats -j4
        export LD_LIBRARY_PATH="$PWD/build-prompt-lookup-main/bin"
        ctest --test-dir build-prompt-lookup-main --output-on-failure -R "^test-ngram-cache$"
        build-prompt-lookup-main/bin/test-ngram-cache /models/gemma.gguf
    '
