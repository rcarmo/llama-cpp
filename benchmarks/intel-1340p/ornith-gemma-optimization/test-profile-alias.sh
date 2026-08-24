#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
out=$root/benchmarks/intel-1340p/ornith-gemma-optimization/profile-alias
model=/var/home/agent/workspace/projects/models/gemma-4-e4b-qat-mtp/gemma-4-E4B_q4_0-it.gguf
draft=/var/home/agent/workspace/projects/models/gemma-4-e4b-qat-mtp/gemma-4-E4B-it-qat-assistant-MTP-Q8_0.gguf
mkdir -p "$out"
export LD_LIBRARY_PATH="$root/build-intel-clang/bin:$root/build-intel-clang/runtime"
for mode in generic legacy; do
  port=$([[ $mode == generic ]] && echo 8290 || echo 8291)
  unset GGML_SPECULATIVE_PROFILE GGML_QWEN35MOE_MTP_PROFILE || true
  [[ $mode == generic ]] && export GGML_SPECULATIVE_PROFILE=1 || export GGML_QWEN35MOE_MTP_PROFILE=1
  "$root/build-intel-clang/bin/llama-server" -m "$model" -md "$draft" --spec-type draft-mtp --spec-draft-n-max 1 \
    -t 8 --cpu-range 0-7 --cpu-strict 1 -c 4096 -b 512 -ub 128 -ctk q8_0 -ctv q8_0 -ctkd q8_0 -ctvd q8_0 \
    --no-ui --no-warmup --host 127.0.0.1 --port "$port" > "$out/$mode.log" 2>&1 & pid=$!
  cleanup(){ kill -TERM "$pid" 2>/dev/null||true; wait "$pid" 2>/dev/null||true; }; trap cleanup EXIT
  for _ in $(seq 1 180); do curl -fsS "http://127.0.0.1:$port/health" >/dev/null 2>&1 && break; sleep 1; done
  curl -fsS -H 'Content-Type: application/json' -d '{"messages":[{"role":"user","content":"Reply exactly OK"}],"temperature":0,"max_tokens":16,"chat_template_kwargs":{"enable_thinking":false}}' \
    "http://127.0.0.1:$port/v1/chat/completions" > "$out/$mode.json"
  cleanup; trap - EXIT
done
jq -cS '{content:.choices[0].message.content,draft:.timings.draft_n,accepted:.timings.draft_n_accepted}' "$out/generic.json" > "$out/generic.normalized.json"
jq -cS '{content:.choices[0].message.content,draft:.timings.draft_n,accepted:.timings.draft_n_accepted}' "$out/legacy.json" > "$out/legacy.normalized.json"
cmp "$out/generic.normalized.json" "$out/legacy.normalized.json"
for mode in generic legacy; do grep -q 'GGML_SPECULATIVE_PROFILE phase=' "$out/$mode.log"; done
printf 'profile_alias_equivalence=passed\n'
cat "$out/generic.normalized.json"
