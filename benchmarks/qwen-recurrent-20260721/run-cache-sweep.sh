#!/usr/bin/env bash
set -euo pipefail
ROOT=/home/me/src/llama-cpp-spacemit-k3
OUT=$ROOT/benchmarks/qwen-parameter-sweep-20260722
SERVER=$ROOT/build-upstream/bin/llama-server
MODEL=/home/me/models/gguf-misc/Qwen3.6-35B-A3B-UD-Q4_K_M-MTP.gguf
INITIAL=$ROOT/benchmarks/qwen-recurrent-20260721/context-initial.json
FOLLOWUP=$ROOT/benchmarks/qwen-recurrent-20260721/context-followup.json
PID=
restore(){ [[ -z ${PID:-} ]] || { kill -TERM "$PID" 2>/dev/null || true; wait "$PID" 2>/dev/null || true; }; systemctl --user start llama-qwen36-35b.service >/dev/null 2>&1 || true; }
trap restore EXIT INT TERM
systemctl --user stop llama-qwen36-35b.service
for spec in cache512:512:128 cache2048:2048:512; do
  IFS=: read -r name batch ubatch <<<"$spec"
  log=$OUT/${name}-server.log
  env LD_LIBRARY_PATH=$ROOT/build-upstream/bin:/home/me/lib GGML_RISCV64_SPACEMIT_MATMUL_SCHEDULE=auto GGML_CPU_GDN_DIRECT_STATE=1 \
    "$SERVER" --model "$MODEL" --spec-type draft-mtp --spec-draft-n-min 1 --spec-draft-n-max 1 --spec-draft-p-min 0 \
    --alias qwen36-cache-sweep --host 127.0.0.1 --port 8090 --threads 8 --threads-batch 8 --threads-draft 8 --threads-batch-draft 8 \
    --batch-size "$batch" --ubatch-size "$ubatch" --ctx-size 4096 --parallel 1 --cache-type-k q8_0 --cache-type-v q8_0 \
    --jinja --cache-prompt --slot-save-path /home/me/tmp/llama-server-slots/qwen36-sweep \
    --metrics --reasoning off --reasoning-format none --reasoning-budget 0 --n-predict -1 --no-warmup --no-webui >"$log" 2>&1 & PID=$!
  for i in $(seq 1 200); do kill -0 "$PID" 2>/dev/null || { tail -100 "$log"; exit 1; }; code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8090/health || true); [[ $code == 200 ]] && break; sleep 1; done
  free -b > "$OUT/${name}-memory-before.txt"
  curl -sS http://127.0.0.1:8090/v1/chat/completions -H 'Content-Type: application/json' --data-binary @"$INITIAL" >"$OUT/${name}-initial.json"
  curl -sS http://127.0.0.1:8090/v1/chat/completions -H 'Content-Type: application/json' --data-binary @"$FOLLOWUP" >"$OUT/${name}-followup.json"
  curl -sS http://127.0.0.1:8090/slots > "$OUT/${name}-slots.json"
  free -b > "$OUT/${name}-memory-after.txt"
  jq -r '["'"$name"'","initial",.usage.prompt_tokens,.timings.cache_n,.timings.prompt_per_second,.timings.predicted_per_second,(.timings.draft_n//0),(.timings.draft_n_accepted//0)]|@tsv' "$OUT/${name}-initial.json"
  jq -r '["'"$name"'","followup",.usage.prompt_tokens,.timings.cache_n,.timings.prompt_per_second,.timings.predicted_per_second,(.timings.draft_n//0),(.timings.draft_n_accepted//0)]|@tsv' "$OUT/${name}-followup.json"
  kill -TERM "$PID"; wait "$PID" || true; PID=
done
trap - EXIT INT TERM
systemctl --user start llama-qwen36-35b.service
for i in $(seq 1 200); do code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8090/health || true); [[ $code == 200 ]] && exit 0; sleep 1; done
exit 1
