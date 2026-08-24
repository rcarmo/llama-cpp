#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/../../.." && pwd)
out_root=${MTP_CHECKPOINT_OUT_ROOT:-$root/benchmarks/intel-1340p/ornith-gemma-optimization/validation/mtp-checkpoint}
base_port=${MTP_CHECKPOINT_BASE_PORT:-8340}

wait_cool_idle() {
  for _ in $(seq 1 180); do
    local load temp
    load=$(awk '{print $1}' /proc/loadavg)
    temp=$(cat /sys/class/thermal/thermal_zone1/temp)
    if awk -v l="$load" -v t="$temp" 'BEGIN{exit !(l<1.5 && t<55000)}'; then
      return 0
    fi
    sleep 5
  done
  echo "host did not reach cool/idle gate" >&2
  return 1
}

run_case() {
  local model=$1 depth=$2 mode=$3 port=$4
  wait_cool_idle
  if [[ $mode == forced ]]; then
    GGML_SPECULATIVE_TEST_FORCE_CHECKPOINT=1 \
    OUT_ROOT="$out_root" RUN_NAME="$model-$mode" \
      "$root/benchmarks/intel-1340p/ornith-gemma-optimization/run-agentic-baseline.sh" "$model" "$depth" "$port" \
      > "$out_root/$model-$mode.stdout"
  elif [[ $mode == zero ]]; then
    GGML_SPECULATIVE_TEST_FORCE_CHECKPOINT=0 \
    OUT_ROOT="$out_root" RUN_NAME="$model-$mode" \
      "$root/benchmarks/intel-1340p/ornith-gemma-optimization/run-agentic-baseline.sh" "$model" "$depth" "$port" \
      > "$out_root/$model-$mode.stdout"
  else
    env -u GGML_SPECULATIVE_TEST_FORCE_CHECKPOINT \
    OUT_ROOT="$out_root" RUN_NAME="$model-$mode" \
      "$root/benchmarks/intel-1340p/ornith-gemma-optimization/run-agentic-baseline.sh" "$model" "$depth" "$port" \
      > "$out_root/$model-$mode.stdout"
  fi
}

mkdir -p "$out_root"
run_case ornith 2 normal "$base_port"
run_case ornith 2 forced "$((base_port + 1))"
run_case gemma4 3 normal "$((base_port + 2))"
run_case gemma4 3 forced "$((base_port + 3))"
if [[ ${MTP_CHECKPOINT_VALIDATE_ZERO:-0} == 1 ]]; then
  run_case ornith 2 zero "$((base_port + 4))"
  if grep -q 'phase=checkpoint_restore' "$out_root/ornith-zero/server.log"; then
    echo "GGML_SPECULATIVE_TEST_FORCE_CHECKPOINT=0 unexpectedly enabled checkpoint restores" >&2
    exit 1
  fi
fi

bun - <<'BUN' "$out_root"
import { readFileSync, writeFileSync } from "node:fs";
const root = process.argv[2];
const summary = {};
for (const model of ["ornith", "gemma4"]) {
  const load = (mode) => JSON.parse(readFileSync(`${root}/${model}-${mode}/response.json`, "utf8"));
  const normalize = (x) => ({
    role: x.choices[0].message.role,
    content: x.choices[0].message.content,
    tool_calls: (x.choices[0].message.tool_calls ?? []).map((t) => ({ type: t.type, function: t.function })),
    finish_reason: x.choices[0].finish_reason,
    prompt_n: x.timings.prompt_n,
    predicted_n: x.timings.predicted_n,
  });
  const normalResponse = load("normal");
  const forcedResponse = load("forced");
  const normal = normalize(normalResponse);
  const forced = normalize(forcedResponse);
  const normalLog = readFileSync(`${root}/${model}-normal/server.log`, "utf8");
  const forcedLog = readFileSync(`${root}/${model}-forced/server.log`, "utf8");
  summary[model] = {
    normal,
    forced,
    semantic_output_identical: JSON.stringify(normal) === JSON.stringify(forced),
    normal_draft: [normalResponse.timings.draft_n, normalResponse.timings.draft_n_accepted],
    forced_draft: [forcedResponse.timings.draft_n, forcedResponse.timings.draft_n_accepted],
    normal_restore_count: (normalLog.match(/phase=checkpoint_restore/g) ?? []).length,
    forced_restore_count: (forcedLog.match(/phase=checkpoint_restore/g) ?? []).length,
  };
  if (!summary[model].semantic_output_identical || summary[model].normal_restore_count !== 0 || summary[model].forced_restore_count < 1) {
    process.exitCode = 1;
  }
}
writeFileSync(`${root}/summary.json`, JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
BUN
