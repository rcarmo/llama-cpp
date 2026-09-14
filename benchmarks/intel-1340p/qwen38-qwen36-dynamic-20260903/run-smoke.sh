#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/../../.." && pwd)
here=$root/benchmarks/intel-1340p/qwen38-qwen36-dynamic-20260903
out=$here/results/qwen38-ud-q4xl/smoke
build=${LLAMA_BUILD:-$root/build-intel-clang}
model=${QWEN38_MODEL:-$root/../models/qwen3.8-27b/Qwen3.8-27B-UD-Q4_K_XL.gguf}
alias=qwen3.8-27b-ud-q4-k-xl
port=8094
server_pid=''
monitor_pid=''
uid=$(id -u)
export XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-/run/user/$uid}
export DBUS_SESSION_BUS_ADDRESS=${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}
export LD_LIBRARY_PATH="$build/bin:$build/runtime${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
mkdir -p "$out"

restore() {
  set +e
  [[ -z $monitor_pid ]] || kill "$monitor_pid" 2>/dev/null
  if [[ -n $server_pid ]] && kill -0 "$server_pid" 2>/dev/null; then
    kill -TERM "$server_pid" 2>/dev/null
    wait "$server_pid" 2>/dev/null
  fi
  systemctl --user stop llama-qwen38-local-provider.service llama-qwen-longctx.service llama-gemma-local-provider.service llama-maple-local-provider.service 2>/dev/null
  systemctl --user start llama-ornith-local-provider.service
}
trap restore EXIT INT TERM

[[ -x $build/bin/llama-server ]] || { echo "missing server" >&2; exit 1; }
[[ $(stat -c %s "$model") == 17559178144 ]] || { echo "unexpected model size" >&2; exit 1; }
[[ $(sha256sum "$model" | awk '{print $1}') == 3f227079003add2511437e5b1e94812e363385225bf6a9b47b0054a72bc8b01e ]] || { echo "model checksum mismatch" >&2; exit 1; }

systemctl --user stop llama-ornith-local-provider.service llama-qwen38-local-provider.service llama-qwen-longctx.service llama-gemma-local-provider.service llama-maple-local-provider.service
for _ in $(seq 1 1800); do
  load=$(awk '{print $1}' /proc/loadavg)
  temp=$(cat /sys/class/thermal/thermal_zone1/temp)
  avail=$(awk '/^MemAvailable:/{print $2}' /proc/meminfo)
  if awk -v l="$load" -v t="$temp" -v a="$avail" 'BEGIN{exit !(l<1.5 && t<60000 && a>28000000)}'; then break; fi
  sleep 2
done

cmd=(taskset -c 0-15 "$build/bin/llama-server"
  --model "$model" --alias "$alias"
  --load-mode mmap --gpu-layers 0
  --threads 8 --cpu-range 0-7 --cpu-strict 1
  --ctx-size 8192 --parallel 1
  --batch-size 1024 --ubatch-size 256
  --cache-type-k q4_0 --cache-type-v q4_0 --flash-attn on
  --cache-prompt --cache-ram 0 --no-cache-idle-slots
  --reasoning-preserve --metrics --slots --no-warmup
  --timeout 1800 --host 127.0.0.1 --port "$port")
printf '%q ' "${cmd[@]}" > "$out/server-command.txt"; printf '\n' >> "$out/server-command.txt"
"${cmd[@]}" > "$out/server.stdout" 2> "$out/server.stderr" &
server_pid=$!
printf '%s\n' "$server_pid" > "$out/server.pid"

(
  printf 'epoch\ttemp_mC\trss_kib\tpss_kib\tvm_swap_kib\tmem_available_kib\tswap_free_kib\n'
  over=0
  while kill -0 "$server_pid" 2>/dev/null; do
    temp=$(cat /sys/class/thermal/thermal_zone1/temp)
    rss=$(awk '/^VmRSS:/{print $2}' "/proc/$server_pid/status" 2>/dev/null || echo 0)
    pss=$(awk '/^Pss:/{print $2}' "/proc/$server_pid/smaps_rollup" 2>/dev/null || echo 0)
    vm_swap=$(awk '/^VmSwap:/{print $2}' "/proc/$server_pid/status" 2>/dev/null || echo 0)
    avail=$(awk '/^MemAvailable:/{print $2}' /proc/meminfo)
    swap_free=$(awk '/^SwapFree:/{print $2}' /proc/meminfo)
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$(date +%s)" "$temp" "$rss" "$pss" "${vm_swap:-0}" "$avail" "$swap_free"
    if ((temp >= 95000)); then over=$((over+1)); else over=0; fi
    if ((over >= 3)); then
      printf 'thermal abort at %s mC\n' "$temp" > "$out/thermal-abort.txt"
      kill -TERM "$server_pid" 2>/dev/null
      exit 1
    fi
    sleep 1
  done
) > "$out/telemetry.tsv" &
monitor_pid=$!

healthy=0
for _ in $(seq 1 900); do
  if ! kill -0 "$server_pid" 2>/dev/null; then break; fi
  if curl -fsS --max-time 2 "http://127.0.0.1:$port/health" > "$out/health.json" 2>/dev/null; then healthy=1; break; fi
  sleep 1
done
if (( !healthy )); then tail -200 "$out/server.stderr" >&2; exit 1; fi
curl -fsS "http://127.0.0.1:$port/v1/models" > "$out/models.json"
curl -fsS "http://127.0.0.1:$port/slots" > "$out/slots-before.json"

jq -n --arg model "$alias" '{model:$model,messages:[{role:"user",content:"Reply with exactly QWEN38_UD_OK and nothing else."}],reasoning_effort:"none",temperature:0,seed:731,max_tokens:24,stream:false}' > "$out/chat.request.json"
curl -fsS --max-time 300 -H 'content-type: application/json' --data-binary "@$out/chat.request.json" "http://127.0.0.1:$port/v1/chat/completions" > "$out/chat.response.json"

jq -n --arg model "$alias" '{model:$model,messages:[{role:"user",content:"Return a JSON object with integer field answer set to 42. No prose."}],reasoning_effort:"none",temperature:0,seed:731,max_tokens:48,response_format:{type:"json_object"},stream:false}' > "$out/json.request.json"
curl -fsS --max-time 300 -H 'content-type: application/json' --data-binary "@$out/json.request.json" "http://127.0.0.1:$port/v1/chat/completions" > "$out/json.response.json"

jq -n --arg model "$alias" '{model:$model,messages:[{role:"user",content:"Use the add tool to add 17 and 25."}],reasoning_effort:"none",temperature:0,seed:731,max_tokens:96,tool_choice:"required",tools:[{type:"function",function:{name:"add",description:"Add two integers",parameters:{type:"object",properties:{a:{type:"integer"},b:{type:"integer"}},required:["a","b"],additionalProperties:false}}}],stream:false}' > "$out/tool.request.json"
curl -fsS --max-time 300 -H 'content-type: application/json' --data-binary "@$out/tool.request.json" "http://127.0.0.1:$port/v1/chat/completions" > "$out/tool.response.json"

jq '.stream=true | .messages[0].content="Reply with exactly STREAM_OK and nothing else."' "$out/chat.request.json" > "$out/stream.request.json"
curl -fsS -N --max-time 300 -H 'content-type: application/json' --data-binary "@$out/stream.request.json" "http://127.0.0.1:$port/v1/chat/completions" > "$out/stream.sse"

jq -n --arg model "$alias" '{model:$model,messages:[{role:"user",content:"Count upward indefinitely, one integer per line. Do not stop."}],reasoning_effort:"none",temperature:0,max_tokens:4096,stream:true}' > "$out/cancel.request.json"
set +e
timeout 3 curl -fsS -N --max-time 300 -H 'content-type: application/json' --data-binary "@$out/cancel.request.json" "http://127.0.0.1:$port/v1/chat/completions" > "$out/cancel.partial.sse" 2> "$out/cancel.stderr"
cancel_rc=$?
set -e
printf '%s\n' "$cancel_rc" > "$out/cancel.exit-code"
recovered=false
for _ in $(seq 1 200); do
  if curl -fsS --max-time 2 "http://127.0.0.1:$port/slots" | jq -e 'all(.[]; (.is_processing // false) == false)' >/dev/null; then recovered=true; break; fi
  sleep 0.05
done
curl -fsS "http://127.0.0.1:$port/slots" > "$out/slots-after.json"
curl -fsS "http://127.0.0.1:$port/metrics" > "$out/metrics-after.txt"

chat=$(jq -r '.choices[0].message.content // ""' "$out/chat.response.json")
json_ok=$(jq -r '.choices[0].message.content | fromjson | .answer == 42' "$out/json.response.json" 2>/dev/null || echo false)
tool_name=$(jq -r '.choices[0].message.tool_calls[0].function.name // ""' "$out/tool.response.json")
tool_args_ok=$(jq -r '.choices[0].message.tool_calls[0].function.arguments | fromjson | (.a==17 and .b==25)' "$out/tool.response.json" 2>/dev/null || echo false)
stream_done=false; grep -q '^data: \[DONE\]' "$out/stream.sse" && stream_done=true
stream_content=$(sed -n 's/^data: //p' "$out/stream.sse" | grep -v '^\[DONE\]$' | jq -r '.choices[0].delta.content // empty' | tr -d '\n')
cancel_ok=false
if [[ $cancel_rc == 124 || $cancel_rc == 137 || $cancel_rc == 143 ]] && [[ $recovered == true ]]; then cancel_ok=true; fi
jq -n \
  --arg chat "$chat" --argjson json_ok "$json_ok" --arg tool_name "$tool_name" --argjson tool_args_ok "$tool_args_ok" \
  --argjson stream_done "$stream_done" --arg stream_content "$stream_content" --argjson cancel_ok "$cancel_ok" --argjson cancel_rc "$cancel_rc" --argjson recovered "$recovered" \
  '{deterministic_chat:{content:$chat,passed:($chat=="QWEN38_UD_OK")},strict_json:{passed:$json_ok},required_tool:{name:$tool_name,arguments_passed:$tool_args_ok,passed:($tool_name=="add" and $tool_args_ok)},sse:{done:$stream_done,content:$stream_content,passed:($stream_done and $stream_content=="STREAM_OK")},cancellation:{client_exit:$cancel_rc,recovered:$recovered,passed:$cancel_ok}}' > "$out/summary.json"
cat "$out/summary.json"
jq -e '[.deterministic_chat.passed,.strict_json.passed,.required_tool.passed,.sse.passed,.cancellation.passed] | all' "$out/summary.json" >/dev/null
[[ ! -e $out/thermal-abort.txt ]]
