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
        cmake --build build-lookup-gemma --target test-ngram-cache llama-lookup-create llama-lookup-stats -j4
        export LD_LIBRARY_PATH="$PWD/build-lookup-gemma/bin"
        ctest --test-dir build-lookup-gemma --output-on-failure -R "^test-ngram-cache$"
        build-lookup-gemma/bin/test-ngram-cache /models/gemma.gguf
    '
