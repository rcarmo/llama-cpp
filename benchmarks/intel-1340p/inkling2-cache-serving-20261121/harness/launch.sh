#!/bin/bash
set -euo pipefail
ws=/var/home/agent/workspace
run="/var/home/agent/workspace/tmp/llama-cpp/runs/inkling-cache-serving-20261121-1dadee62b"
runtime="$ws/tmp/llama-cpp/runs/upstream-review-20261114-976edc030/private-podman.sh"
closure=$(cat "$run/runtime-path.txt")
model="$ws/projects/models/inkling-2-mini/Inkling-2-Mini-IQ4_NL.gguf"
projector="$ws/projects/models/inkling-2-mini/mmproj-Inkling-2-Mini-Q8_0.gguf"
limit=24964497408
name=inkling2-mini-cache768-webui-20261121
label=serve-cache768
export TMPDIR="$run/tmp" TMP="$run/tmp" TEMP="$run/tmp" BUN_TMPDIR="$run/tmp"
p() { bash "$runtime" "$@"; }
sha256sum -c "$run/runtime.sha256" > "$run/launch-integrity.log"
if p container exists "$name";then echo 'Existing deployment: inspect instead of overwriting' >&2;exit 1;fi
if ss -ltn |grep -q ':11434 ';then echo 'Port11434 is occupied' >&2;exit 1;fi
available=$(awk '/MemAvailable:/{print $2}' /proc/meminfo)
(( available*1024 >= limit+2147483648 ))
args=(--verbosity 4 --model "$model" --mmproj "$projector" --no-mmproj-offload
    --alias Inkling-2-Mini --device none --gpu-layers 0
    --load-mode mmap --no-host --no-repack --no-op-offload --no-kv-offload
    --threads 4 --threads-batch 16 --cpu-mask 0x55 --cpu-mask-batch 0xffff
    --cpu-strict 1 --cpu-strict-batch 1 --poll 50 --poll-batch 50
    --ctx-size 65536 --parallel 1 --batch-size 512 --ubatch-size 128
    --flash-attn off --cache-type-k f16 --cache-type-v f16
    --cache-ram 768 --ctx-checkpoints 2 --no-context-shift
    --n-predict -1 --jinja --reasoning on --reasoning-format deepseek --reasoning-budget -1
    --reasoning-effort high
    --temp 1 --top-p 1 --top-k 50 --min-p 0 --seed 42
    --host 192.168.1.70 --port 11434 --threads-http 4)
p run -d --name "$name" --restart=no --network host --cpus 16 --memory "$limit" --memory-swap "$limit" \
    --pids-limit 256 --userns keep-id --security-opt label=disable --cap-drop=all \
    -v "$closure:$closure:ro" -v "$model:$model:ro" -v "$projector:$projector:ro" -v "$run:$run:rw" -w "$run" \
    -e TMPDIR="$run/tmp" -e TMP="$run/tmp" -e TEMP="$run/tmp" -e XDG_CACHE_HOME="$run/tmp/cache" \
    -e LD_LIBRARY_PATH="$closure" \
    --log-driver k8s-file --log-opt path="$run/$label.server.log" --log-opt max-size=20mb \
    --entrypoint /bin/bash localhost/llama-intel-build:fedora44 \
    "$run/entry.sh" "$run" "$model" "$projector" "$limit" "$closure/llama-server" "${args[@]}" > "$run/$label.container.id"
p inspect "$name" > "$run/$label.container-start.json"
