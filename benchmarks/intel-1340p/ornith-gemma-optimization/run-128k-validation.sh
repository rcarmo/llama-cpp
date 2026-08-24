#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/../../.." && pwd)
work=$root/benchmarks/intel-1340p/ornith-gemma-optimization/workloads/near-capacity-128k
out=$root/benchmarks/intel-1340p/ornith-gemma-optimization/validation/candidate-128k

wait_cool_idle() {
  for _ in $(seq 1 360); do
    local load temp
    load=$(awk '{print $1}' /proc/loadavg)
    temp=$(cat /sys/class/thermal/thermal_zone1/temp)
    if awk -v l="$load" -v t="$temp" 'BEGIN{exit !(l<1.0 && t<50000)}'; then
      return 0
    fi
    sleep 10
  done
  echo "host did not reach cool/idle gate" >&2
  return 1
}

mkdir -p "$out"
rm -f "$out/campaign-complete.txt" "$out/campaign-failed.txt"

for profile in ornith gemma4; do
  run_dir=$out/$profile-128k-b1024-u256
  if [[ -d $run_dir && ! -s $run_dir/result.json ]]; then
    mv "$run_dir" "$run_dir-interrupted-$(date +%Y%m%dT%H%M%S)"
  fi
done

run_profile() {
  local profile=$1 port=$2 request=$3
  local run_name=$profile-128k-b1024-u256
  local metadata=$work/$profile-tokenization.json
  if [[ -s $out/$run_name/result.json ]]; then
    printf 'skipped_completed=%s time=%s\n' "$profile" "$(date -Ins)" >> "$out/campaign-resume.log"
    return 0
  fi
  wait_cool_idle
  local stamp
  stamp=$(date +%Y%m%dT%H%M%S)
  VALIDATION_CTX=$(jq -r '.context' "$metadata") \
  VALIDATION_BATCH=1024 \
  VALIDATION_UBATCH=256 \
  VALIDATION_REQUEST="$request" \
  VALIDATION_MIN_PROMPT_TOKENS=$(jq -r '.prompt_tokens_min' "$metadata") \
  VALIDATION_RESERVED_OUTPUT_TOKENS=$(jq -r '.reserved_output_tokens' "$metadata") \
  VALIDATION_REQUIRED_TOOL=$(jq -r '.required_tool_name' "$metadata") \
  VALIDATION_REQUEST_SHA256=$(jq -r '.request_sha256' "$metadata") \
  VALIDATION_TIMEOUT=10800 \
  VALIDATION_SAMPLE_INTERVAL=2 \
  VALIDATION_MAX_TEMP_MC=95000 \
  VALIDATION_OUT_ROOT="$out" \
  VALIDATION_RUN_NAME="$run_name" \
    "$root/tools/validate-intel-candidate.sh" "$profile" "$port" \
    > "$out/$profile-128k-$stamp.stdout" \
    2> "$out/$profile-128k-$stamp.stderr"
}

if ! run_profile ornith 8480 "$work/ornith-request.json"; then
  printf 'failed=ornith time=%s\n' "$(date -Ins)" > "$out/campaign-failed.txt"
  exit 1
fi

if ! run_profile gemma4 8481 "$work/gemma4-request.json"; then
  printf 'failed=gemma4 time=%s\n' "$(date -Ins)" > "$out/campaign-failed.txt"
  exit 1
fi

if ! "$root/benchmarks/intel-1340p/ornith-gemma-optimization/summarize-128k-validation.ts" "$out" \
  > "$out/summary.stdout" 2> "$out/summary.stderr"; then
  printf 'failed=summary time=%s\n' "$(date -Ins)" > "$out/campaign-failed.txt"
  exit 1
fi
if ! "$root/benchmarks/intel-1340p/ornith-gemma-optimization/render-128k-results.ts" "$out/summary.json" \
  > "$out/render.stdout" 2> "$out/render.stderr"; then
  printf 'failed=render time=%s\n' "$(date -Ins)" > "$out/campaign-failed.txt"
  exit 1
fi
printf 'completed=%s\n' "$(date -Ins)" > "$out/campaign-complete.txt"
