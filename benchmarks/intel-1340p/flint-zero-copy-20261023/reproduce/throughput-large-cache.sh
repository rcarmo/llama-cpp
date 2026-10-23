#!/bin/bash
set -euo pipefail
ws=/var/home/agent/workspace
run="$ws/tmp/llama-cpp/runs/flint-trial-20261023-be9528654612"
export TMPDIR="$run/tmp" TMP="$run/tmp" TEMP="$run/tmp" BUN_TMPDIR="$run/tmp"
while kill -0 "$(cat "$run/throughput-core-supervisor.pid")" 2>/dev/null;do
 grep -q '^COMPLETE' "$run/throughput-core-status.txt" && break
 sleep 5
done
if ! grep -q '^COMPLETE' "$run/throughput-core-status.txt";then echo 'CPU screen failed; stop';exit 1;fi
! podman ps --format '{{.Names}}' |grep '^flint-'
cp "$run/build.log" "$run/build-before-large-cache.log"
cp "$run/configure.log" "$run/configure-before-large-cache.log"
bash "$run/build.sh"
while test "$(podman inspect flint-build --format '{{.State.Status}}')" = running;do sleep 2;done
podman inspect flint-build --format '{{.State.Status}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}}' > "$run/large-cache-build-after.txt"
test "$(podman inspect flint-build --format '{{.State.ExitCode}}')" = 0
podman rm flint-build >/dev/null
sha256sum "$ws/tmp/llama-cpp/build/source-1309921403/flint-vulkan/bin/test-flint-handoff-synthetic" "$ws/tmp/llama-cpp/build/source-1309921403/flint-vulkan/bin/libllama.so.0.7.0" > "$run/large-cache-binary.sha256"
model="$ws/projects/models/flint/flint-UD-Q3_K_XL.gguf"
export FLINT_PROMPT=512 FLINT_DECODE=64 FLINT_REPS=2 FLINT_THREADS=4 FLINT_CPUS=4 FLINT_POOL=0 FLINT_FA=0 FLINT_UBATCH=128
: > "$run/throughput-large-cache-status.txt"
for cache in 1024 2048 4096;do
 label="bench-gpu$cache"
 echo "START $(date -u +%FT%TZ) $label" |tee -a "$run/throughput-large-cache-status.txt"
 if test -f "$run/$label.exit";then echo "EXISTS $label";continue;fi
 if bash "$run/run-core-trial.sh" "$label" gpu "$cache" bench "$model" > "$run/$label-supervisor.log" 2>&1;then
  grep -E 'BENCH_CONFIG|BENCH_RESULT|EXPERT_CACHE phase|RESULT' "$run/$label.log" |tee -a "$run/throughput-large-cache-status.txt"
 else
  echo "FAILED $label; stop larger-cache escalation" |tee -a "$run/throughput-large-cache-status.txt"
  exit 1
 fi
 sleep 5
done
printf 'COMPLETE %s\n' "$(date -u +%FT%TZ)" |tee -a "$run/throughput-large-cache-status.txt"
