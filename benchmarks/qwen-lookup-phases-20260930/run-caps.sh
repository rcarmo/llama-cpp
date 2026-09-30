#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Profile Qwen lookup bookkeeping, verification rows and rejection costs without altering live service","kind":"mixed","weight":"heavy","role":"entrypoint"}
set -euo pipefail
root=$(cd "${1:?usage: bash run-caps.sh WORKSPACE-TRIAL-ROOT}" && pwd); workspace=$(cd "$root/../.." && pwd)
repo="$workspace/tmp/qwen-moe-lookup-20260930/candidate"
model="$workspace/projects/models/qwen3.6/Qwen3.6-35B-A3B-UD-Q2_K_XL.gguf"
cache="$workspace/tmp/qwen-moe-lookup-20260930/replay-base/cache.bin"
fixtures="$workspace/tmp/qwen-code-ab-20260930"
name=qwen-draft-cap
trap 'podman rm -f "$name" >/dev/null 2>&1 || true' EXIT
mkdir -p "$root/caps"
# Existing SSE fixture captures fresh request plus prefix-reused continuation.
for fixture in prose-4k copy-1k; do
 if [[ $fixture == prose-4k ]]; then arms="cap2 cap1"; else arms="cap2"; fi
 for arm in $arms; do
  out="$root/caps/$fixture-$arm"; [[ ! -e "$out" ]] || { echo "refuse overwrite $out"; exit 2; };mkdir -p "$out"
  runtime="$root/limit-runtime"
  args=(--spec-type ngram-cache -lcs "$cache" --spec-ngram-cache-n-max "${arm#cap}")
  [[ "$(curl -fsS --max-time 2 http://192.168.1.70:11434/slots)" != *'"is_processing":true'* ]] || { echo 'live Qwen busy';exit 12; }
  timeout --signal=TERM --kill-after=15 480 podman run --rm --name "$name" --network none --security-opt label=disable --userns=keep-id --cpus=16 --memory=8g --memory-swap=8g --pids-limit=160 -v "$repo:$repo:ro" -v "$root:$root" -v "$fixtures:$fixtures:ro" -v "$model:/models/qwen.gguf:ro" -v "$cache:$cache:ro" -w "$repo" -e OUT="$out" -e ROOT="$root" -e RUNTIME="$runtime" -e FIXTURE="$fixture" -e FIXTURES="$fixtures" -e GGML_SPECULATIVE_PROFILE=1 -e LD_LIBRARY_PATH="$runtime" localhost/llama-intel-build:fedora44 bash -lc '
set -euo pipefail
pid="";trap '\''if [[ -n "$pid" ]];then kill "$pid" 2>/dev/null||true;fi'\'' EXIT
"$RUNTIME/llama-server" -m /models/qwen.gguf -ngl 0 -t 8 -tb 16 -c 8704 -b 1024 -ub 256 -ctk f16 -ctv f16 -fa auto -np 1 --fit off --no-warmup --host 127.0.0.1 --port 18081 "$@" > "$OUT/server.stdout" 2> "$OUT/server.stderr" &
pid=$!; ready=0
for i in $(seq 1 100);do if curl -fsS --max-time 1 http://127.0.0.1:18081/health > "$OUT/health.json" 2>/dev/null;then ready=1;break;fi;kill -0 "$pid";sleep 1;done
[[ $ready == 1 ]]
python3 "$FIXTURES/stream-fixture.py" "$FIXTURES" "$OUT" "$FIXTURE" > "$OUT/test.stdout" 2> "$OUT/test.stderr"
for f in memory.peak memory.current memory.swap.peak memory.events;do echo "$f";cat /sys/fs/cgroup/$f;done > "$OUT/cgroup"
cat /proc/$pid/status > "$OUT/process.status"
kill "$pid";wait "$pid"||true;pid=""
' _ "${args[@]}" > "$out/container.stdout" 2> "$out/container.stderr" &
  runner=$!
  while kill -0 "$runner" 2>/dev/null;do
   avail=$(awk '/MemAvailable:/{print $2}' /proc/meminfo);printf '%s\t%s\t%s\n' "$(date +%s)" "$arm" "$avail" >> "$root/caps-monitor.tsv"
   if ((avail<6291456));then podman rm -f "$name" >/dev/null 2>&1||true;wait "$runner"||true;exit 10;fi
   slots=$(curl -fsS --max-time 1 http://192.168.1.70:11434/slots||true)
   if [[ "$slots" == *'"is_processing":true'* ]];then echo 'live Qwen busy; terminate only benchmark';podman rm -f "$name" >/dev/null 2>&1||true;wait "$runner"||true;exit 12;fi
   sleep 2
  done
  wait "$runner"; echo "$fixture $arm finished"
 done
done
