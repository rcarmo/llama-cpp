#!/bin/bash
set -euo pipefail
ws=/var/home/agent/workspace
run="$ws/tmp/llama-cpp/runs/flint-trial-20261023-be9528654612";root="$run/coding"
export TMPDIR="$run/tmp" TMP="$run/tmp" TEMP="$run/tmp" BUN_TMPDIR="$run/tmp"
export FLINT_CPUS=16 FLINT_THREADS=4 FLINT_BATCH_THREADS=16 FLINT_UBATCH=512 FLINT_POOL=2 FLINT_FA=0
model="$ws/projects/models/flint/flint-UD-Q3_K_XL.gguf"
(cd "$root";sha256sum -c FROZEN-SHA256SUMS) > "$root/frozen-before.log"
: > "$root/status.txt"
: > "$root/results.jsonl"
for id in csv-row merge-patch async-map subtract-ranges round-decimal glob-match;do
 label="coding-$id";export FLINT_CODING_CASE="$root/$id.case.json" FLINT_CODING_OUTPUT="$root/$id.output.json"
 echo "START $(date -u +%FT%TZ) $id" |tee -a "$root/status.txt"
 if ! bash "$root/run-coding-trial.sh" "$label" cpu 0 coding "$model" > "$run/$label-supervisor.log" 2>&1;then
  printf '{"id":"%s","pass":false,"error":"native execution failed"}\n' "$id" |tee -a "$root/results.jsonl"
  test ! -e "$run/$label-abort.txt" || exit 1
  grep -q 'oom=true' "$run/$label-after.txt" && exit 1
  continue
 fi
 grep -E 'CODING_RESULT|RESULT' "$run/$label.log" |tee -a "$root/status.txt"
 if bash "$root/score-container.sh" score "$id" "$root/$id.output.json" > "$root/$id.score.json" 2> "$root/$id.score-stderr.log";then
  cat "$root/$id.score.json" |tee -a "$root/results.jsonl"
 else
  printf '{"id":"%s","pass":false,"error":"scorer timeout or crash"}\n' "$id" |tee "$root/$id.score.json" -a "$root/results.jsonl"
  if podman container exists flint-code-score;then podman kill flint-code-score >/dev/null 2>&1||true;podman rm flint-code-score >/dev/null 2>&1||true;fi
 fi
 sleep 4
done
(cd "$root";sha256sum -c FROZEN-SHA256SUMS) > "$root/frozen-after.log"
printf 'COMPLETE %s\n' "$(date -u +%FT%TZ)" |tee -a "$root/status.txt"
