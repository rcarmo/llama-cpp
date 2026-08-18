#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/../../.." && pwd)
here=$root/benchmarks/intel-1340p/qwen38-campaign
out=$here/vision
mmproj=$root/../models/qwen3.8-27b/mmproj-Qwen3.8-27B-Q8_0.gguf
image=$out/red-square.png
server_pid=''
uid=$(id -u)
export XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-/run/user/$uid}
export DBUS_SESSION_BUS_ADDRESS=${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}
services=(llama-gemma-local-provider.service llama-maple-local-provider.service llama-qwen-longctx.service)
restore() {
  if [[ -n $server_pid ]] && kill -0 "$server_pid" 2>/dev/null; then kill -TERM "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true; fi
  systemctl --user start "${services[@]}" 2>/dev/null || true
}
trap restore EXIT INT TERM
[[ -s $mmproj && -s $image ]]
systemctl --user stop "${services[@]}" llama-qwen38-local-provider.service
for _ in $(seq 1 1800); do
  load=$(awk '{print $1}' /proc/loadavg); temp=$(cat /sys/class/thermal/thermal_zone1/temp)
  if awk -v l="$load" -v t="$temp" 'BEGIN{exit !(l<1.5 && t<60000)}'; then break; fi
  sleep 2
done
LLAMA_CTX=4096 LLAMA_KV=q4_0 LLAMA_MTP_DEPTH=3 LLAMA_MM_PROJ="$mmproj" \
  "$root/tools/run-intel-qwen38.sh" > "$out/server.stdout" 2> "$out/server.stderr" &
server_pid=$!
healthy=0
for _ in $(seq 1 900); do
  if ! kill -0 "$server_pid" 2>/dev/null; then break; fi
  if curl -fsS --max-time 2 http://127.0.0.1:8094/health > "$out/health.json" 2>/dev/null; then healthy=1; break; fi
  sleep 1
done
if (( !healthy )); then wait "$server_pid" || true; server_pid=''; tail -200 "$out/server.stderr" >&2; exit 1; fi
encoded=$(base64 -w0 "$image")
jq -n --arg image "data:image/png;base64,$encoded" '{model:"qwen3.8-27b-q4km-mtp",messages:[{role:"user",content:[{type:"image_url",image_url:{url:$image}},{type:"text",text:"Identify the dominant color and basic shape. Reply in one short sentence."}]}],reasoning_effort:"none",temperature:0,seed:731,max_tokens:64,stream:false}' > "$out/request.json"
curl -fsS --max-time 900 -H 'Content-Type: application/json' --data-binary "@$out/request.json" \
  http://127.0.0.1:8094/v1/chat/completions > "$out/response.json"
jq -e '.choices[0].message.content | test("red";"i") and test("square";"i")' "$out/response.json" >/dev/null
pid=$server_pid
{ awk '/VmRSS|VmSwap/{print}' "/proc/$pid/status"; awk '/Pss|Private|Shared/{print}' "/proc/$pid/smaps_rollup"; } > "$out/resources.txt"
jq '{content:.choices[0].message.content,usage,timings}' "$out/response.json"
kill -TERM "$server_pid"; wait "$server_pid" || true; server_pid=''
