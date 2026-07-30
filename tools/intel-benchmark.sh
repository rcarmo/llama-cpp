#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
build=${BUILD_DIR:-$root/build-intel-vulkan}
models=${MODEL_DIR:-$root/../models/qwen3.6}
out_root=${OUT_DIR:-$root/benchmarks/intel-1340p}
reps=${REPETITIONS:-3}
threads=${THREADS:-8}
affinity=${AFFINITY:-all}
gpu_layers=${GPU_LAYERS:-0}
model_name=${MODEL:-Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf}
model=$models/$model_name

case "$affinity" in
  all) cpus=0-15 ;;
  pcore-threads) cpus=0-7 ;;
  pcore-physical) cpus=0,2,4,6 ;;
  ecores) cpus=8-15 ;;
  *) cpus=$affinity ;;
esac

[[ -s "$model" ]] || { echo "missing model: $model" >&2; exit 1; }
[[ -x "$build/bin/llama-bench" ]] || { echo "missing llama-bench: $build/bin/llama-bench" >&2; exit 1; }
export LD_LIBRARY_PATH="$build/bin${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export GGML_VK_VISIBLE_DEVICES=${GGML_VK_VISIBLE_DEVICES:-0}

ts=$(date -u +%Y%m%dT%H%M%SZ)
out=$out_root/${ts}-${model_name%.gguf}-ngl${gpu_layers}-t${threads}-${affinity}
mkdir -p "$out"

capture_temp() {
  local max=0 value
  for f in /sys/class/hwmon/hwmon*/temp*_input /sys/class/thermal/thermal_zone*/temp; do
    [[ -r "$f" ]] || continue
    read -r value < "$f" || continue
    (( value > max )) && max=$value
  done
  printf '%s' "$max"
}

{
  printf 'timestamp=%s\n' "$ts"
  printf 'commit=%s\n' "$(git -C "$root" rev-parse HEAD)"
  printf 'build=%s\nmodel=%s\nmodel_sha256=%s\n' "$build" "$model" "$(sha256sum "$model" | cut -d' ' -f1)"
  printf 'gpu_layers=%s\nthreads=%s\naffinity=%s\ncpus=%s\nrepetitions=%s\n' "$gpu_layers" "$threads" "$affinity" "$cpus" "$reps"
  printf 'kernel=%s\n' "$(uname -r)"
  printf 'load_start='; cat /proc/loadavg
  lscpu
  "$build/bin/llama-bench" --list-devices
} > "$out/metadata.txt" 2>&1

run_case() {
  local name=$1 p=$2 n=$3
  local json=$out/$name.json log=$out/$name.log
  local temp_before temp_after
  temp_before=$(capture_temp)
  printf 'temp_before_mC=%s load_before=' "$temp_before" > "$log"; cat /proc/loadavg >> "$log"
  # Keep repetitions in one loaded process, as in the K3 llama-bench campaign.
  /usr/bin/time -v taskset -c "$cpus" "$build/bin/llama-bench" \
    -m "$model" -ngl "$gpu_layers" -t "$threads" \
    -b 512 -ub 128 -p "$p" -n "$n" -r "$reps" -o json \
    > "$json" 2>> "$log"
  temp_after=$(capture_temp)
  printf 'temp_after_mC=%s load_after=' "$temp_after" >> "$log"; cat /proc/loadavg >> "$log"
}

# Prompt and generation run in separate processes, matching the K3 campaign.
run_case pp64 64 0
run_case pp128 128 0
run_case tg32 0 32
printf 'artifact=%s\n' "$out"
