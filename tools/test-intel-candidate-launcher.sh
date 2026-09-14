#!/usr/bin/env bash
# Test launcher argv and validation without loading a model or starting a server.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/build/bin"
printf '#!/bin/sh\nexit 99\n' > "$tmp/build/bin/llama-server"
chmod +x "$tmp/build/bin/llama-server"
printf 'fixture\n' > "$tmp/model.gguf"
run() {
  env -i PATH="$PATH" HOME="$tmp" LLAMA_ROOT="$root" LLAMA_BUILD="$tmp/build" \
    LLAMA_MODEL="$tmp/model.gguf" LLAMA_ALIAS=test LLAMA_DRY_RUN=1 \
    "$@" bash "$root/tools/run-intel-candidate.sh"
}
require() { [[ " $output " == *" $1 "* ]] || { echo "missing argv: $1" >&2; exit 1; }; }
reject() {
  if run "$@" > "$tmp/out" 2> "$tmp/err"; then echo "accepted invalid configuration: $*" >&2; exit 1; fi
  grep -q 'LLAMA_' "$tmp/err"
}
output=$(run)
require '--threads 8 --cpu-range 0-7 --cpu-strict 1'
require '--threads-batch 8 --cpu-range-batch 0-7 --cpu-strict-batch 1'
require '--spec-draft-threads 8 --spec-draft-threads-batch 8'
output=$(run LLAMA_THREADS=4 LLAMA_CPUS=2-5)
require '--threads-batch 4 --cpu-range-batch 2-5 --cpu-strict-batch 1'
require '--spec-draft-cpu-range 2-5 --spec-draft-cpu-strict 1'
require '--spec-draft-cpu-mask-batch 3c --spec-draft-cpu-strict-batch 1'
output=$(run LLAMA_CPUS_BATCH=64-67)
require '--spec-draft-cpu-mask-batch f0000000000000000 --spec-draft-cpu-strict-batch 1'
output=$(run LLAMA_THREADS_BATCH=16 LLAMA_CPUS_BATCH=0-15)
require '--threads 8 --cpu-range 0-7 --cpu-strict 1'
require '--threads-batch 16 --cpu-range-batch 0-15 --cpu-strict-batch 1'
require '--spec-draft-threads 8 --spec-draft-threads-batch 16'
require '--spec-draft-cpu-mask-batch ffff --spec-draft-cpu-strict-batch 1'
output=$(run LLAMA_USE_MTP=0 LLAMA_THREADS_BATCH=16 LLAMA_CPUS_BATCH=0-15)
require '--threads-batch 16 --cpu-range-batch 0-15 --cpu-strict-batch 1'
[[ "$output" != *--spec-draft* ]]
for n in 0 -1 text; do reject LLAMA_THREADS_BATCH="$n"; done
for r in 7-0 0,2,4 0-foo 0-512 0-18446744073709551616; do reject LLAMA_CPUS_BATCH="$r"; done
output=$(env -i PATH="$PATH" HOME="$tmp" bash -c '
  set -a
  source "$1/tools/config/llama-gemma4-candidate.env.example"
  export LLAMA_BUILD="$2/build" LLAMA_MODEL="$2/model.gguf" LLAMA_DRAFT_MODEL="$2/model.gguf"
  export LLAMA_SLOT_DIR="$2/slots" LLAMA_DRY_RUN=1
  bash "$1/tools/run-intel-candidate.sh"
' bash "$root" "$tmp")
require '--threads-batch 16 --cpu-range-batch 0-15 --cpu-strict-batch 1'
require '--ctx-size 262144 --parallel 2 --no-kv-unified --cont-batching'
require '--cache-type-k f16 --cache-type-v f16 --flash-attn off'
require '--spec-draft-n-max 3'
require '--cache-ram 12288'
# Optional integration check against the installed profile's real argument parser.
# --help parses argv and exits without loading model weights or binding a port.
if [[ ${1:-} == --installed-parser ]]; then
  env -i PATH="$PATH" HOME="$tmp" bash -c '
    set -a
    source "$1/tools/config/llama-gemma4-candidate.env.example"
    export LLAMA_SLOT_DIR="$2/slots"
    bash "$1/tools/run-intel-candidate.sh" --help
  ' bash "$root" "$tmp" > "$tmp/help" 2>&1 || { cat "$tmp/help" >&2; exit 1; }
fi
printf 'PASS: inherited defaults, split prefill affinity, MTP, target-only, invalid inputs and Gemma profile\n'
