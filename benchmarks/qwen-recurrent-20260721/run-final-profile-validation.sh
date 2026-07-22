#!/usr/bin/env bash
set -euo pipefail
ROOT=/home/me/src/llama-cpp-spacemit-k3
OUT=$ROOT/benchmarks/qwen-parameter-sweep-20260722
idx=0
while IFS= read -r row; do
  idx=$((idx+1))
  printf '%s\n' "$row" | jq -c '. + {model:"qwen36-35b-a3b-q4km-mtp",temperature:0,reasoning_budget_tokens:0,chat_template_kwargs:{enable_thinking:false}}' > "$OUT/final-request.json"
  if [[ ! -s "$OUT/final-corpus-${idx}.json" ]]; then
    curl -sS http://127.0.0.1:8090/v1/chat/completions -H 'Content-Type: application/json' --data-binary @"$OUT/final-request.json" >"$OUT/final-corpus-${idx}.json"
  fi
  jq -r '["final",'"$idx"',.timings.prompt_per_second,.timings.predicted_per_second,.timings.draft_n,.timings.draft_n_accepted]|@tsv' "$OUT/final-corpus-${idx}.json"
done < "$ROOT/benchmarks/qwen-recurrent-20260721/workloads-corpus.jsonl"
if [[ ! -s "$OUT/final-cache-initial.json" ]]; then
  curl -sS http://127.0.0.1:8090/v1/chat/completions -H 'Content-Type: application/json' --data-binary @"$ROOT/benchmarks/qwen-recurrent-20260721/context-initial.json" > "$OUT/final-cache-initial.json"
fi
if [[ ! -s "$OUT/final-cache-followup.json" ]]; then
  curl -sS http://127.0.0.1:8090/v1/chat/completions -H 'Content-Type: application/json' --data-binary @"$ROOT/benchmarks/qwen-recurrent-20260721/context-followup.json" > "$OUT/final-cache-followup.json"
fi
jq -r '["cache-initial",.usage.prompt_tokens,.timings.cache_n,.timings.prompt_per_second,.timings.predicted_per_second,.timings.draft_n,.timings.draft_n_accepted]|@tsv' "$OUT/final-cache-initial.json"
jq -r '["cache-followup",.usage.prompt_tokens,.timings.cache_n,.timings.prompt_per_second,.timings.predicted_per_second,.timings.draft_n,.timings.draft_n_accepted]|@tsv' "$OUT/final-cache-followup.json"
curl -sS http://127.0.0.1:8090/slots > "$OUT/final-slots.json"
free -b > "$OUT/final-memory.txt"
curl -sS --compressed -o /dev/null -w 'ui_http=%{http_code}\n' -H 'Accept-Encoding: gzip' http://127.0.0.1:8090/
rm -f "$OUT/final-request.json"
