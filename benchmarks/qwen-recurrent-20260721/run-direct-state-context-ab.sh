#!/usr/bin/env bash
set -euo pipefail
ROOT=/home/me/src/llama-cpp-spacemit-k3
OUT=$ROOT/benchmarks/qwen-recurrent-20260721
SERVER=$ROOT/build-k3-tests/bin/llama-server
MODEL=/home/me/models/gguf-misc/Qwen3.6-35B-A3B-UD-Q4_K_M-MTP.gguf
PID=
restore(){ [[ -z ${PID:-} ]] || { kill -TERM "$PID" 2>/dev/null || true; wait "$PID" 2>/dev/null || true; }; systemctl --user start llama-qwen36-35b.service >/dev/null 2>&1 || true; }
trap restore EXIT INT TERM
systemctl --user stop llama-qwen36-35b.service
for gate in off on; do
  envs=(env LD_LIBRARY_PATH=$ROOT/build-k3-tests/bin:/home/me/lib GGML_RISCV64_SPACEMIT_MATMUL_SCHEDULE=auto)
  [[ $gate == on ]] && envs+=(GGML_CPU_GDN_DIRECT_STATE=1)
  "${envs[@]}" "$SERVER" --model "$MODEL" --spec-type draft-mtp --spec-draft-n-min 1 --spec-draft-n-max 3 --spec-draft-p-min 0 \
    --alias qwen36-35b-a3b-q4km-mtp --host 127.0.0.1 --port 8090 --threads 8 --threads-batch 8 --threads-draft 8 --threads-batch-draft 8 \
    --batch-size 2048 --ubatch-size 512 --ctx-size 4096 --parallel 1 --cache-type-k q8_0 --cache-type-v q8_0 --jinja --cache-prompt \
    --metrics --reasoning off --reasoning-format none --reasoning-budget 0 --n-predict -1 --no-warmup --no-webui >"$OUT/direct-state-context-${gate}-server.log" 2>&1 & PID=$!
  for i in $(seq 1 200); do kill -0 "$PID" 2>/dev/null || exit 1; code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8090/health || true); [[ $code == 200 ]] && break; sleep 1; done
  free -b > "$OUT/direct-state-context-${gate}-memory-before.txt"
  curl -sS http://127.0.0.1:8090/v1/chat/completions -H 'Content-Type: application/json' --data-binary @"$OUT/context-initial.json" >"$OUT/direct-state-context-${gate}-initial-out.json"
  curl -sS http://127.0.0.1:8090/v1/chat/completions -H 'Content-Type: application/json' --data-binary @"$OUT/context-followup.json" >"$OUT/direct-state-context-${gate}-followup-out.json"
  curl -sS http://127.0.0.1:8090/slots > "$OUT/direct-state-context-${gate}-slots.json"
  free -b > "$OUT/direct-state-context-${gate}-memory-after.txt"
  jq -r '["'"$gate"'","initial",.usage.prompt_tokens,.timings.cache_n,.timings.prompt_per_second,.timings.predicted_per_second,.timings.draft_n,.timings.draft_n_accepted] | @tsv' "$OUT/direct-state-context-${gate}-initial-out.json"
  jq -r '["'"$gate"'","followup",.usage.prompt_tokens,.timings.cache_n,.timings.prompt_per_second,.timings.predicted_per_second,.timings.draft_n,.timings.draft_n_accepted] | @tsv' "$OUT/direct-state-context-${gate}-followup-out.json"
  kill -TERM "$PID"; wait "$PID" || true; PID=
done
trap - EXIT INT TERM
systemctl --user start llama-qwen36-35b.service
for i in $(seq 1 200); do code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8090/health || true); [[ $code == 200 ]] && exit 0; sleep 1; done
exit 1
