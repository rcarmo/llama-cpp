#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
model_name=${1:?ornith|gemma4}
port=${2:?port}
workspace=$(cd "$root/.." && pwd)
storage=$workspace/.podman-llama-storage
runroot=$workspace/.podman-llama-run
image=${LLAMA_SYCL_BUILD_IMAGE:-localhost/llama-intel-sycl:oneapi-2025.3.3-l0-1.28.2}
ngl=${NGL:-99}
ngld=${NGLD:-0}
graph=${SYCL_GRAPH:-0}
run_name=${RUN_NAME:-${model_name}-ngl${ngl}-ngld${ngld}-graph${graph}}
out=$root/benchmarks/intel-1340p/ornith-gemma-optimization/sycl/model-sweep/$run_name
rm -rf "$out"; mkdir -p "$out"

case "$model_name" in
 ornith)
  model=/var/home/agent/workspace/projects/models/ornith-1.0-35b-mtp-apex/Ornith-1.0-35B-MTP-APEX-I-Mini.gguf
  draft=
  depth=2
  ;;
 gemma4)
  model=/var/home/agent/workspace/projects/models/gemma-4-e4b-qat-mtp/gemma-4-E4B_q4_0-it.gguf
  draft=/var/home/agent/workspace/projects/models/gemma-4-e4b-qat-mtp/gemma-4-E4B-it-qat-assistant-MTP-Q8_0.gguf
  depth=3
  ;;
 *) exit 2;;
esac
request=$root/benchmarks/intel-1340p/qwen-longctx-fieldfare/workloads/agentic-tool-planning-3k.json

podman --root "$storage" --runroot "$runroot" --storage-driver vfs --cgroup-manager=cgroupfs run --rm --network=host --security-opt label=disable \
 --userns=keep-id --user "$(id -u):$(id -g)" --device /dev/dri/renderD128 --device /dev/dri/card0 \
 -v /var/home/agent/workspace:/var/home/agent/workspace -w "$root" \
 -e MODEL="$model" -e DRAFT="$draft" -e DEPTH="$depth" -e PORT="$port" -e REQUEST="$request" -e OUT="$out" \
 -e NGL="$ngl" -e NGLD="$ngld" -e SYCL_GRAPH="$graph" "$image" '
set -euo pipefail
export ONEAPI_DEVICE_SELECTOR=level_zero:gpu
export ZES_ENABLE_SYSMAN=1
export GGML_SYCL_DEBUG=1
export GGML_SYCL_ENABLE_GRAPH="$SYCL_GRAPH"
export GGML_SYCL_ENABLE_FLASH_ATTN=1
export GGML_SYCL_USE_LEVEL_ZERO_API=1
export SYCL_PROGRAM_COMPILE_OPTIONS=-cl-fp32-correctly-rounded-divide-sqrt
export GGML_SPECULATIVE_PROFILE=1
export LD_LIBRARY_PATH="$PWD/build-intel-sycl/bin:$PWD/build-intel-sycl/runtime:${LD_LIBRARY_PATH:-}"
spec=(--spec-type draft-mtp --spec-draft-n-min 1 --spec-draft-n-max "$DEPTH" --spec-draft-type-k q8_0 --spec-draft-type-v q8_0)
[[ -z "$DRAFT" ]] || spec+=(--model-draft "$DRAFT")
build-intel-sycl/bin/llama-server --model "$MODEL" --gpu-layers "$NGL" --spec-draft-ngl "$NGLD" --split-mode none --main-gpu 0 \
 --threads 8 --ctx-size 4096 --parallel 1 --batch-size 512 --ubatch-size 128 \
 --cache-type-k q8_0 --cache-type-v q8_0 --flash-attn on --load-mode mmap --no-warmup --no-ui \
 --host 127.0.0.1 --port "$PORT" "${spec[@]}" > "$OUT/server.log" 2>&1 & pid=$!
cleanup(){ kill -TERM "$pid" 2>/dev/null||true; wait "$pid" 2>/dev/null||true; }; trap cleanup EXIT
for _ in $(seq 1 360); do curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && break; kill -0 "$pid" 2>/dev/null || { tail -100 "$OUT/server.log"; exit 1; }; sleep 1; done
curl -fsS --max-time 1800 -H Content-Type:application/json --data-binary "@$REQUEST" "http://127.0.0.1:$PORT/v1/chat/completions" > "$OUT/response.json"
awk "/VmRSS:|VmSwap:/{print}" /proc/$pid/status > "$OUT/memory.txt"
cleanup; trap - EXIT
'

jq -n --arg model "$model_name" --arg run_name "$run_name" --argjson ngl "$ngl" --argjson ngld "$ngld" --argjson graph "$graph" \
 --arg tool "$(jq -r '.choices[0].message.tool_calls[0].function.name // ""' "$out/response.json")" \
 --argjson prompt_tps "$(jq '.timings.prompt_per_second // null' "$out/response.json")" \
 --argjson generation_tps "$(jq '.timings.predicted_per_second // null' "$out/response.json")" \
 --argjson drafts "$(jq '.timings.draft_n // 0' "$out/response.json")" \
 --argjson accepted "$(jq '.timings.draft_n_accepted // 0' "$out/response.json")" \
 '{model:$model,run_name:$run_name,ngl:$ngl,ngld:$ngld,sycl_graph:$graph,tool_name:$tool,prompt_tps:$prompt_tps,generation_tps:$generation_tps,draft_tokens:$drafts,accepted_draft_tokens:$accepted}' > "$out/result.json"
cat "$out/result.json"
