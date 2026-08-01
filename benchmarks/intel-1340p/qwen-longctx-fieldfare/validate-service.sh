#!/usr/bin/env bash
set -euo pipefail

service=${1:-llama-qwen-longctx.service}
url=${LLAMA_URL:-http://127.0.0.1:8090}
out=${LLAMA_VALIDATE_OUT:-/var/home/agent/workspace/projects/llama-cpp/benchmarks/intel-1340p/qwen-longctx-fieldfare/service-validation}
uid=$(id -u)
export XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-/run/user/$uid}
export DBUS_SESSION_BUS_ADDRESS=${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}
mkdir -p "$out"

wait_ready() {
  local deadline=${1:-360}
  local code=000
  for _ in $(seq 1 "$deadline"); do
    code=$(curl -sS -o "$out/health.json" -w '%{http_code}' "$url/health" 2>/dev/null || true)
    [[ $code == 200 ]] && return 0
    sleep 1
  done
  echo "health did not reach 200 (last=$code)" >&2
  return 1
}

wait_ready 360
systemctl --user is-active --quiet "$service"

curl -fsS "$url/slots" > "$out/slots.json"
[[ $(jq 'length' "$out/slots.json") -eq 1 ]]
[[ $(jq '.[0].n_ctx' "$out/slots.json") -eq 131072 ]]
[[ $(jq -r '.[0].speculative' "$out/slots.json") == true ]]

curl -fsS "$url/metrics" > "$out/metrics.txt"
grep -q '^llamacpp:expert_io_nodes_total ' "$out/metrics.txt"

curl -fsS --compressed -D "$out/ui.headers" "$url/" -o "$out/ui.html"
grep -qi '^content-type: text/html' "$out/ui.headers"
grep -qi '<!doctype html' "$out/ui.html"

request=/var/home/agent/workspace/projects/llama-cpp/benchmarks/intel-1340p/qwen-longctx-fieldfare/workloads/agentic-tool-planning-3k.json
curl -fsS --max-time 900 -H 'Content-Type: application/json' --data-binary "@$request" "$url/v1/chat/completions" > "$out/agentic.response.json"
[[ $(jq -r '.choices[0].message.tool_calls[0].function.name // ""' "$out/agentic.response.json") == search_repository ]]
[[ $(jq -r '.choices[0].message.tool_calls[0].function.arguments | fromjson | .query' "$out/agentic.response.json") == MADV_WILLNEED ]]

systemctl --user restart "$service"
wait_ready 360
systemctl --user is-active --quiet "$service"
curl -fsS "$url/slots" > "$out/slots-after-restart.json"
[[ $(jq '.[0].n_ctx' "$out/slots-after-restart.json") -eq 131072 ]]

jq -n \
  --arg service "$service" \
  --arg url "$url" \
  --argjson n_ctx "$(jq '.[0].n_ctx' "$out/slots-after-restart.json")" \
  --arg tool "$(jq -r '.choices[0].message.tool_calls[0].function.name' "$out/agentic.response.json")" \
  --argjson prompt_tps "$(jq '.timings.prompt_per_second' "$out/agentic.response.json")" \
  --argjson generation_tps "$(jq '.timings.predicted_per_second' "$out/agentic.response.json")" \
  '{service:$service,url:$url,n_ctx:$n_ctx,ui:true,metrics:true,restart:true,tool_name:$tool,prompt_tps:$prompt_tps,generation_tps:$generation_tps}' > "$out/result.json"
cat "$out/result.json"
