#!/usr/bin/env bash
set -euo pipefail
repo=/var/home/agent/workspace/projects/llama-cpp
out="$repo/benchmarks/intel-1340p/huihui-gemma4-12b-trial-20260917/zero-copy-cutover"
build="$repo/build-gemma-zc-speed"
runtime="$repo/runtime/gemma-vulkan-f32-0bdd7cd8b/runtime"
models=/var/home/agent/workspace/projects/models/huihui-gemma-4-12b-abliterated-qat
model="$models/Huihui-gemma-4-12B-it-qat-q4_0-unquantized-abliterated-Q4_K.gguf"
draft="$models/mtp-ggml-model-bf16.gguf"
prod=llama-gemma-zero-copy.service
proxy=llama-gemma-lan-test.service
proxy_socket=llama-gemma-lan-test.socket
trial=huihui-gemma4-12b-zero-copy.service
trial_port=8094
export XDG_RUNTIME_DIR=/run/user/$(id -u) DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$(id -u)/bus
restored=0
restore_primary() {
    local rc=$?
    if [[ $restored == 0 ]]; then
        systemctl --user stop "$trial" >/dev/null 2>&1 || true
        systemctl --user reset-failed "$trial" >/dev/null 2>&1 || true
        systemctl --user start "$prod" >/dev/null 2>&1 || true
        systemctl --user start "$proxy_socket" >/dev/null 2>&1 || true
        local ready=0
        for _ in $(seq 1 240); do
            if curl -fsS http://127.0.0.1:18094/health > "$out/rollback-health.json" 2>/dev/null; then ready=1; break; fi
            sleep 1
        done
        systemctl --user show "$prod" -p ActiveState -p SubState -p MainPID -p NRestarts -p MemorySwapCurrent -p MemorySwapPeak > "$out/rollback-service.txt" 2>&1 || true
        [[ $ready == 1 ]] || rc=1
    fi
    exit "$rc"
}
trap restore_primary EXIT INT TERM

systemctl --user stop huihui-gemma4-12b-trial.service >/dev/null 2>&1 || true
systemctl --user reset-failed huihui-gemma4-12b-trial.service >/dev/null 2>&1 || true
# The LAN proxy Requires= the primary model. Stop both socket and service before
# the primary or an audit request would reactivate the primary beside Huihui.
systemctl --user stop "$proxy_socket" "$proxy" >/dev/null 2>&1 || true
systemctl --user stop "$prod"
# Wait for the old mappings and page cache pressure to fall before starting both 12B owners.
for _ in $(seq 1 60); do
    [[ $(awk '/MemAvailable:/{print $2}' /proc/meminfo) -ge 20971520 ]] && break
    sleep 1
done
printf 'mem_available_kib=%s\n' "$(awk '/MemAvailable:/{print $2}' /proc/meminfo)" > "$out/post-stop-memory.txt"

systemd-run --user --unit "$trial" --collect \
  -p Type=simple -p TimeoutStopSec=30 -p MemoryMax=28G -p MemorySwapMax=0 -p TasksMax=256 \
  --setenv=LD_LIBRARY_PATH="$build/bin:$runtime" \
  --setenv=GGML_VK_VISIBLE_DEVICES=0 \
  --setenv=GGML_VK_EXPERIMENTAL_ATTN_MODE=f32 \
  --setenv=GGML_CPU_EXPERIMENTAL_Q4_N4_SCHEDULE=1 \
  "$build/bin/llama-gemma-zero-copy-server" \
    --model "$model" --draft "$draft" --alias huihui-gemma-4-12b-abliterated-zero-copy \
    --host 0.0.0.0 --port "$trial_port" --ctx-size 8192 --batch-size 256 --ubatch-size 256 \
    --threads 8 --threads-batch 16 --draft-max 3 --draft-min 1 \
    --threadpools 0 --model-sampling 1 --max-output 2048 > "$out/systemd-run.txt"
ready=0
for _ in $(seq 1 360); do
    if curl -fsS "http://127.0.0.1:$trial_port/health" > "$out/health-before.json" 2>/dev/null; then ready=1; break; fi
    [[ $(systemctl --user show "$trial" -p ActiveState --value) == failed ]] && break
    sleep 1
done
systemctl --user show "$trial" -p ActiveState -p SubState -p MainPID -p NRestarts -p MemoryCurrent -p MemoryPeak -p MemorySwapCurrent -p MemorySwapPeak > "$out/service-before.txt"
journalctl --user -u "$trial" --no-pager > "$out/journal-before.txt"
[[ $ready == 1 ]]
grep -Fx 'MemorySwapPeak=0' "$out/service-before.txt"

cat > "$out/smoke.json" <<'JSON'
{"model":"huihui-gemma-4-12b-abliterated-zero-copy","messages":[{"role":"user","content":"Reply with exactly HUIHUI_ZERO_COPY"}],"temperature":0,"max_tokens":64,"stream":false,"chat_template_kwargs":{"enable_thinking":false}}
JSON
curl --max-time 300 -fsS "http://127.0.0.1:$trial_port/v1/chat/completions" -H 'Content-Type: application/json' --data-binary @"$out/smoke.json" > "$out/smoke-response.json"
jq -e '.choices[0].message.content == "HUIHUI_ZERO_COPY" and (.choices[0].message.reasoning_content // "") == "" and .zero_copy.zero_copy == true and .zero_copy.shared_bytes > 0 and .zero_copy.copied_bytes == 0' "$out/smoke-response.json"
curl -fsS -H 'Accept-Encoding: gzip' -D "$out/ui-headers.txt" "http://192.168.1.70:$trial_port/" > "$out/ui-index.html.gz"
grep -qi '^Content-Type: text/html' "$out/ui-headers.txt"
gzip -t "$out/ui-index.html.gz"
curl -fsS "http://127.0.0.1:$trial_port/health" > "$out/health-after.json"
jq -e '.status == "ok" and .vulkan_model_resident == true and .handoffs > 0 and .shared_bytes > 0 and .copied_bytes == 0' "$out/health-after.json"
systemctl --user show "$trial" -p ActiveState -p SubState -p MainPID -p NRestarts -p MemoryCurrent -p MemoryPeak -p MemorySwapCurrent -p MemorySwapPeak > "$out/service-after.txt"
for x in ActiveState=active SubState=running NRestarts=0 MemorySwapCurrent=0 MemorySwapPeak=0; do grep -Fx "$x" "$out/service-after.txt"; done
pid=$(sed -n 's/^MainPID=//p' "$out/service-after.txt")
{
  printf 'pid=%s\nexe=%s\nargv=' "$pid" "$(readlink -f /proc/$pid/exe)"
  tr '\0' ' ' < /proc/$pid/cmdline
  printf '\n'
} > "$out/runtime-identity.txt"
journalctl --user -u "$trial" --no-pager > "$out/journal-after.txt"
# Leave the trial live. The EXIT trap is disabled only after all gates pass.
restored=1
trap - EXIT INT TERM
printf 'trial_live=1\nurl=http://192.168.1.70:8094/\nprimary_stopped=1\nprimary_proxy_stopped=1\n' > "$out/live.txt"
