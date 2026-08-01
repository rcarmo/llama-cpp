#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/../../.." && pwd)
name=${1:?name}
model=${2:?model}
ctx=${3:?ctx}
kv=${4:?kv}
draft=${5:?draft depth}
port=${6:?port}
out="$root/benchmarks/intel-1340p/qwen-longctx-fieldfare/probes/$name"
rm -rf "$out"
mkdir -p "$out"

export LD_LIBRARY_PATH="$root/build-intel-clang/bin:$root/build-intel-clang/runtime${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export GGML_CPU_EXPERT_IO_PROFILE=1
export GGML_CPU_EXPERT_IO_ADVISE_MODE=bounded

spec=(--spec-type none)
if (( draft > 0 )); then
  spec=(--spec-type draft-mtp --spec-draft-n-min 1 --spec-draft-n-max "$draft"
        --spec-draft-threads 8 --spec-draft-threads-batch 8
        --spec-draft-type-k "$kv" --spec-draft-type-v "$kv")
fi

before_swap=$(awk '/^(pswpin|pswpout) /{s+=$2} END{print s}' /proc/vmstat)
before_major=$(awk '/^pgmajfault /{print $2}' /proc/vmstat)
start=$(date +%s)

taskset -c 0-15 "$root/build-intel-clang/bin/llama-server" \
  -m "$model" -ngl 0 -t 8 --cpu-range 0-7 --cpu-strict 1 \
  --ctx-size "$ctx" --parallel 1 --batch-size 512 --ubatch-size 128 \
  --cache-type-k "$kv" --cache-type-v "$kv" --flash-attn on --cache-prompt \
  --load-mode mmap --no-warmup --metrics --host 127.0.0.1 --port "$port" \
  "${spec[@]}" >"$out/server.log" 2>&1 &
pid=$!
cleanup(){ kill -TERM "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
printf 'epoch\telapsed\trss_kib\tvm_kib\tpss_kib\tread_bytes\tminflt\tmajflt\tmem_available_kib\tswap_free_kib\tpswp_delta\tpgmaj_delta\n' > "$out/samples.tsv"
ready=0
for _ in $(seq 1 360); do
  now=$(date +%s)
  if [[ -r /proc/$pid/status ]]; then
    rss=$(awk '/^VmRSS:/{print $2}' /proc/$pid/status); vm=$(awk '/^VmSize:/{print $2}' /proc/$pid/status)
    pss=$(awk '/^Pss:/{s+=$2} END{print s+0}' /proc/$pid/smaps_rollup 2>/dev/null || echo 0)
    read_bytes=$(awk '/^read_bytes:/{print $2}' /proc/$pid/io 2>/dev/null || echo 0)
    read -r minflt majflt < <(awk '{print $10,$12}' /proc/$pid/stat)
    mem_avail=$(awk '/^MemAvailable:/{print $2}' /proc/meminfo); swap_free=$(awk '/^SwapFree:/{print $2}' /proc/meminfo)
    swap_now=$(awk '/^(pswpin|pswpout) /{s+=$2} END{print s}' /proc/vmstat); major_now=$(awk '/^pgmajfault /{print $2}' /proc/vmstat)
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$now" "$((now-start))" "${rss:-0}" "${vm:-0}" "$pss" "$read_bytes" "$minflt" "$majflt" "$mem_avail" "$swap_free" "$((swap_now-before_swap))" "$((major_now-before_major))" >> "$out/samples.tsv"
  fi
  if curl -fsS "http://127.0.0.1:$port/health" > "$out/health.json" 2>/dev/null; then ready=1; break; fi
  if ! kill -0 "$pid" 2>/dev/null; then break; fi
  sleep 1
done
printf '{"name":"%s","model":"%s","ctx":%s,"kv":"%s","draft":%s,"ready":%s,"startup_seconds":%s,"pid":%s}\n' "$name" "$model" "$ctx" "$kv" "$draft" "$ready" "$(( $(date +%s)-start ))" "$pid" > "$out/result.json"
if (( ready )); then
  curl -fsS "http://127.0.0.1:$port/metrics" > "$out/metrics.txt"
  curl -fsS -H 'Accept: text/html' -H 'Accept-Encoding: gzip' "http://127.0.0.1:$port/" -o "$out/ui.html.gz"
fi
cleanup
trap - EXIT INT TERM
jq . "$out/result.json"
tail -5 "$out/samples.tsv"
(( ready ))
