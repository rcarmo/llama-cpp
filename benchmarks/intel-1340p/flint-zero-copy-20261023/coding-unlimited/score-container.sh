#!/bin/bash
set -euo pipefail
ws=/var/home/agent/workspace
run="$ws/tmp/llama-cpp/runs/flint-trial-20261023-be9528654612"
root="$run/coding-unlimited";scratch="$root/sandbox-temp"
export TMPDIR="$run/tmp" TMP="$run/tmp" TEMP="$run/tmp" BUN_TMPDIR="$run/tmp"
bunbin=$(readlink -f "$(command -v bun)")
# Only benchmark case/output files and the Bun binary are visible to candidate code.
timeout --signal=TERM --kill-after=2s 10s podman run --rm --name flint-code-score --network none --cpus=1 --memory=256m --memory-swap=256m --pids-limit=64 --read-only --read-only-tmpfs=false --cap-drop=ALL --security-opt no-new-privileges --security-opt label=disable --userns=keep-id -v "$root:$root:ro" -v "$bunbin:/opt/bun:ro" --tmpfs "$scratch:rw,nosuid,nodev,noexec,size=16m" -e TMPDIR="$scratch" -e TMP="$scratch" -e TEMP="$scratch" -e BUN_TMPDIR="$scratch" -e BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 --entrypoint /opt/bun localhost/llama-intel-build:fedora44 "$root/verify.mjs" "$@"
