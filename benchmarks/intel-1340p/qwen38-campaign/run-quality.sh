#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/../../.." && pwd)
here=$root/benchmarks/intel-1340p/qwen38-campaign
out=$here/quality/qwen38
fixtures=$here/performance/fixtures
BUN_BIN=${BUN_BIN:-/opt/piclaw/current/bun/bin/bun}
server_pid=''
uid=$(id -u)
export XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-/run/user/$uid}
export DBUS_SESSION_BUS_ADDRESS=${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}
services=(llama-gemma-local-provider.service llama-maple-local-provider.service llama-qwen-longctx.service)
mkdir -p "$out"
restore() {
  if [[ -n $server_pid ]] && kill -0 "$server_pid" 2>/dev/null; then kill -TERM "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true; fi
  systemctl --user start "${services[@]}" 2>/dev/null || true
}
trap restore EXIT INT TERM

systemctl --user stop "${services[@]}" llama-qwen38-local-provider.service
for _ in $(seq 1 1800); do
  load=$(awk '{print $1}' /proc/loadavg); temp=$(cat /sys/class/thermal/thermal_zone1/temp)
  if awk -v l="$load" -v t="$temp" 'BEGIN{exit !(l<1.5 && t<60000)}'; then break; fi
  sleep 2
done
LLAMA_CTX=8192 LLAMA_KV=q4_0 LLAMA_MTP_DEPTH=3 "$root/tools/run-intel-qwen38.sh" \
  > "$out/server.stdout" 2> "$out/server.stderr" &
server_pid=$!
printf '%s\n' "$server_pid" > "$out/server.pid"
healthy=0
for _ in $(seq 1 900); do
  if ! kill -0 "$server_pid" 2>/dev/null; then break; fi
  if curl -fsS --max-time 2 http://127.0.0.1:8094/health > "$out/health.json" 2>/dev/null; then healthy=1; break; fi
  sleep 1
done
if (( !healthy )); then wait "$server_pid" || true; server_pid=''; tail -200 "$out/server.stderr" >&2; exit 1; fi
curl -fsS http://127.0.0.1:8094/v1/models > "$out/models.json"
curl -fsS http://127.0.0.1:8094/slots > "$out/slots-before.json"

set +e
(cd "$root" && "$BUN_BIN" benchmarks/intel-1340p/qwen38-campaign/run-matched-corpus.ts \
  http://127.0.0.1:8094 qwen3.8-27b-q4km-mtp qwen38 "$out/api") \
  > "$out/api-run.stdout" 2> "$out/api-run.stderr"
api_rc=$?
set -e
printf '%s\n' "$api_rc" > "$out/api-run.exit-code"

jq '.cache_prompt=true' "$fixtures/completion-4096.json" > "$out/cache-request.json"
for pass in first second; do
  curl -fsS --max-time 1800 -H 'Content-Type: application/json' --data-binary "@$out/cache-request.json" \
    http://127.0.0.1:8094/completion > "$out/cache-$pass.json"
done

"$here/run-pi-suite.sh" > "$out/pi-run.stdout" 2> "$out/pi-run.stderr"
curl -fsS http://127.0.0.1:8094/slots > "$out/slots-after.json"
curl -fsS http://127.0.0.1:8094/metrics > "$out/metrics-after.txt"
{ awk '/VmRSS|VmSwap/{print}' "/proc/$server_pid/status"; awk '/Pss|Private|Shared/{print}' "/proc/$server_pid/smaps_rollup"; } > "$out/resources-after.txt"

jq -n \
  --argjson api_exit "$api_rc" \
  --slurpfile api "$out/api/summary.json" \
  --slurpfile cache_first "$out/cache-first.json" \
  --slurpfile cache_second "$out/cache-second.json" \
  --slurpfile pi "$here/pi/qwen38/summary.json" \
  '{api_exit_code:$api_exit,api:$api[0],cache:{first:{cache_n:$cache_first[0].timings.cache_n,prompt_n:$cache_first[0].timings.prompt_n,prompt_tps:$cache_first[0].timings.prompt_per_second},second:{cache_n:$cache_second[0].timings.cache_n,prompt_n:$cache_second[0].timings.prompt_n,prompt_tps:$cache_second[0].timings.prompt_per_second}},pi:$pi[0]}' \
  > "$out/summary.json"
cat "$out/summary.json"
kill -TERM "$server_pid"; wait "$server_pid" || true; server_pid=''
