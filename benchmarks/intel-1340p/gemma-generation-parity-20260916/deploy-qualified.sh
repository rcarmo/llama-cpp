#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Deploy the qualified immutable Gemma generation-parity closure with automatic rollback","kind":"mutating","weight":"heavy","role":"entrypoint"}
set -euo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
campaign="$root/benchmarks/intel-1340p/gemma-generation-parity-20260916"
out="$campaign/deployment"
rollback="$root/runtime/deployments/gemma-zero-copy-rollback-0ba23ad3"
candidate="$root/runtime/deployments/gemma-generation-parity-ddb93ad19-7871f502"
env_file="$HOME/.config/llama-gemma-zero-copy/service.env"
production=llama-gemma-zero-copy.service
export XDG_RUNTIME_DIR=/run/user/$(id -u)
export DBUS_SESSION_BUS_ADDRESS=unix:path=$XDG_RUNTIME_DIR/bus
committed=0

rollback_on_error() {
    local rc=$?
    if [[ $committed == 0 ]]; then
        install -m 0600 "$rollback/service.env" "$env_file"
        systemctl --user restart "$production" >/dev/null 2>&1 || true
        local ready=0
        for _ in $(seq 1 180); do
            if curl -fsS http://127.0.0.1:18094/health > "$out/automatic-rollback-health.json" 2>/dev/null; then ready=1; break; fi
            sleep 1
        done
        systemctl --user show "$production" -p ActiveState -p SubState -p MainPID -p NRestarts -p MemorySwapCurrent -p MemorySwapPeak > "$out/automatic-rollback-service.txt" 2>&1 || true
        [[ $ready == 1 ]] || rc=1
    fi
    exit "$rc"
}
trap rollback_on_error EXIT INT TERM

[[ -e "$campaign/qualification/complete" ]]
(cd "$rollback" && sha256sum -c SHA256SUMS)
(cd "$candidate" && sha256sum -c SHA256SUMS)
[[ $(systemctl --user show "$production" -p ActiveState --value) == active ]]
[[ $(systemctl --user show "$production" -p MemorySwapCurrent --value) == 0 ]]
[[ $(systemctl --user show "$production" -p MemorySwapPeak --value) == 0 ]]
cp "$env_file" "$out/pre-deploy-service.env"
systemctl --user show "$production" -p MainPID -p NRestarts -p MemoryCurrent -p MemoryPeak -p MemorySwapCurrent -p MemorySwapPeak > "$out/pre-deploy-service.txt"

install -m 0600 "$candidate/service.env" "$env_file"
systemctl --user restart "$production"
ready=0
for _ in $(seq 1 180); do
    if curl -fsS http://127.0.0.1:18094/health > "$out/live-health-before.json" 2>/dev/null; then ready=1; break; fi
    sleep 1
done
[[ $ready == 1 ]]

curl -fsS http://127.0.0.1:18094/props > "$out/live-props.json"
jq -e '.default_generation_settings.params |
  .top_k == 64 and .["speculative.n_min"] == 1 and
  .threadpools == false and .model_sampling == true and .backend_sampling == false' "$out/live-props.json"

curl -fsS -H 'Accept-Encoding: gzip' -D "$out/loopback-ui-headers.txt" http://127.0.0.1:18094/ > "$out/loopback-ui-index.html.gz"
grep -qi '^Content-Type: text/html' "$out/loopback-ui-headers.txt"
grep -qi '^Content-Encoding: gzip' "$out/loopback-ui-headers.txt"
gzip -t "$out/loopback-ui-index.html.gz"

curl -fsS -H 'Accept-Encoding: gzip' -D "$out/lan-ui-headers.txt" http://192.168.1.70:8094/ > "$out/lan-ui-index.html.gz"
grep -qi '^Content-Type: text/html' "$out/lan-ui-headers.txt"
grep -qi '^Content-Encoding: gzip' "$out/lan-ui-headers.txt"
gzip -t "$out/lan-ui-index.html.gz"

curl -fsS http://127.0.0.1:18094/v1/chat/completions \
  -H 'Content-Type: application/json' -H 'X-Conversation-Id: deployed-parity-smoke' \
  -d '{"model":"gemma-4-e4b-qat-mtp-zero-copy","messages":[{"role":"user","content":"Reply with exactly DEPLOYED"}],"temperature":0,"max_tokens":32,"stream":false}' \
  > "$out/live-loopback-response.json"
jq -e '.choices[0].message.content == "DEPLOYED" and .zero_copy.zero_copy == true and
  .zero_copy.shared_bytes > 0 and .zero_copy.copied_bytes == 0' "$out/live-loopback-response.json"
curl -fsS -X DELETE -H 'X-Conversation-Id: deployed-parity-smoke' http://127.0.0.1:18094/v1/stream > "$out/live-loopback-reset.json"

GEMMA_ZERO_COPY_URL=http://192.168.1.70:8094 bun "$root/tools/gemma-hybrid/verify-stream.ts" > "$out/live-lan-stream.json"
jq -e '.passed == true and .progress_count >= 1 and .content_count >= 2 and
  .first_content_ms < .final_ms and .zero_copy.zero_copy == true and .zero_copy.copied_bytes == 0' "$out/live-lan-stream.json"
curl -fsS -X DELETE -H 'X-Conversation-Id: verify-live-stream' http://192.168.1.70:8094/v1/stream > "$out/live-lan-stream-reset.json"

curl -fsS http://127.0.0.1:18094/health > "$out/live-health-after.json"
jq -e '.status == "ok" and .processing == false and .vulkan_model_resident == true and
  .handoffs > 0 and .shared_bytes > 0 and .copied_bytes == 0' "$out/live-health-after.json"
systemctl --user show "$production" -p ActiveState -p SubState -p MainPID -p NRestarts -p MemoryCurrent -p MemoryPeak -p MemorySwapCurrent -p MemorySwapPeak > "$out/live-service.txt"
for expected in ActiveState=active SubState=running NRestarts=0 MemorySwapCurrent=0 MemorySwapPeak=0; do grep -Fx "$expected" "$out/live-service.txt"; done

pid=$(sed -n 's/^MainPID=//p' "$out/live-service.txt")
[[ $(readlink -f "/proc/$pid/exe") == "$candidate/bin/llama-gemma-zero-copy-server" ]]
sha256sum "/proc/$pid/exe" > "$out/live-exe-SHA256SUMS"
grep -Fx '7871f50260b2d4491f719fefe64f768ded8fceb22248177418d349a3c237f314  /proc/'"$pid"'/exe' "$out/live-exe-SHA256SUMS"
{
    printf 'pid=%s\nargv=' "$pid"; tr '\0' ' ' < "/proc/$pid/cmdline"; printf '\n'
    printf 'exe=%s\n' "$(readlink -f "/proc/$pid/exe")"
    grep -E 'lib(llama|ggml|omp|vulkan)' "/proc/$pid/maps" | awk '{print $6}' | sort -u
} > "$out/live-runtime-identity.txt"
awk '/runtime\/deployments\/gemma-generation-parity-ddb93ad19-7871f502\/bin\/lib(llama|ggml)|libllama-server-impl/{n++} END{exit !(n==7)}' "$out/live-runtime-identity.txt"
grep -F "$root/runtime/gemma-vulkan-f32-0bdd7cd8b/runtime/libomp.so" "$out/live-runtime-identity.txt"

journalctl --user -u "$production" --since '-10 minutes' --no-pager > "$out/live-journal.txt"
sha256sum "$out"/* > "$out/deployment-SHA256SUMS"
touch "$out/complete"
committed=1
