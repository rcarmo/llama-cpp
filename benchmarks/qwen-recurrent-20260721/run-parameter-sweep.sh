#!/usr/bin/env bash
set -euo pipefail
ROOT=/home/me/src/llama-cpp-spacemit-k3
OUT=$ROOT/benchmarks/qwen-parameter-sweep-20260722
SERVER=$ROOT/build-upstream/bin/llama-server
MODEL=/home/me/models/gguf-misc/Qwen3.6-35B-A3B-UD-Q4_K_M-MTP.gguf
CORPUS=$ROOT/benchmarks/qwen-recurrent-20260721/workloads-corpus.jsonl
mkdir -p "$OUT"
PID=
restore(){ [[ -z ${PID:-} ]] || { kill -TERM "$PID" 2>/dev/null || true; wait "$PID" 2>/dev/null || true; }; systemctl --user start llama-qwen36-35b.service >/dev/null 2>&1 || true; }
trap restore EXIT INT TERM
wait_ready(){
  local log=$1
  for i in $(seq 1 200); do
    kill -0 "$PID" 2>/dev/null || { tail -100 "$log"; return 1; }
    code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8090/health || true)
    [[ $code == 200 ]] && { echo "ready_seconds=$i"; return 0; }
    sleep 1
  done
  return 1
}
run_config(){
  local name=$1 threads=$2 batch=$3 ubatch=$4 draft=$5
  local log=$OUT/${name}-server.log
  local -a spec=()
  [[ $draft == none ]] || spec=(--spec-type draft-mtp --spec-draft-n-min 1 --spec-draft-n-max "$draft" --spec-draft-p-min 0)
  env LD_LIBRARY_PATH=$ROOT/build-upstream/bin:/home/me/lib \
      GGML_RISCV64_SPACEMIT_MATMUL_SCHEDULE=auto GGML_CPU_GDN_DIRECT_STATE=1 \
    "$SERVER" --model "$MODEL" "${spec[@]}" --alias qwen36-sweep --host 127.0.0.1 --port 8090 \
    --threads "$threads" --threads-batch "$threads" --threads-draft "$threads" --threads-batch-draft "$threads" \
    --batch-size "$batch" --ubatch-size "$ubatch" --ctx-size 4096 --parallel 1 \
    --cache-type-k q8_0 --cache-type-v q8_0 --jinja --cache-prompt --metrics \
    --reasoning off --reasoning-format none --reasoning-budget 0 --n-predict -1 --no-warmup --no-webui >"$log" 2>&1 & PID=$!
  local ready; ready=$(wait_ready "$log")
  free -b > "$OUT/${name}-memory-before.txt"
  local idx=0
  while IFS= read -r row && [[ $idx -lt 3 ]]; do
    idx=$((idx+1))
    jq -c '. + {model:"qwen36-sweep",temperature:0,reasoning_budget_tokens:0,chat_template_kwargs:{enable_thinking:false}}' <<<"$row" > "$OUT/request.json"
    curl -sS http://127.0.0.1:8090/v1/chat/completions -H 'Content-Type: application/json' --data-binary @"$OUT/request.json" >"$OUT/${name}-${idx}.json"
    jq -r '["'"$name"'",'"$threads"','"$batch"','"$ubatch"',"'"$draft"'",'"$idx"',.timings.prompt_per_second,.timings.predicted_per_second,(.timings.draft_n//0),(.timings.draft_n_accepted//0)] | @tsv' "$OUT/${name}-${idx}.json"
  done < "$CORPUS"
  free -b > "$OUT/${name}-memory-after.txt"
  curl -sS http://127.0.0.1:8090/slots > "$OUT/${name}-slots.json"
  kill -TERM "$PID"; wait "$PID" || true; PID=
  echo "$ready" > "$OUT/${name}-ready.txt"
}
case ${1:-draft} in
  draft)
    systemctl --user stop llama-qwen36-35b.service
    run_config draft3 8 2048 512 3
    run_config draft2 8 2048 512 2
    run_config draft1 8 2048 512 1
    run_config nospec 8 2048 512 none
    ;;
  batch)
    systemctl --user stop llama-qwen36-35b.service
    run_config batch512  8  512 128 1
    run_config batch1024 8 1024 256 1
    ;;
  threads)
    systemctl --user stop llama-qwen36-35b.service
    run_config threads6 6 2048 512 1
    ;;
  *) echo "unknown stage: $1" >&2; exit 2;;
esac
rm -f "$OUT/request.json"
trap - EXIT INT TERM
systemctl --user start llama-qwen36-35b.service
for i in $(seq 1 200); do code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8090/health || true); [[ $code == 200 ]] && exit 0; sleep 1; done
exit 1
