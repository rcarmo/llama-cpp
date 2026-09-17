#!/usr/bin/env bash
set -euo pipefail
export XDG_RUNTIME_DIR=/run/user/$(id -u) DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$(id -u)/bus
trial=huihui-gemma4-12b-zero-copy.service
primary=llama-gemma-zero-copy.service
proxy_socket=llama-gemma-lan-test.socket
out=/var/home/agent/workspace/projects/llama-cpp/benchmarks/intel-1340p/huihui-gemma4-12b-trial-20260917/zero-copy-cutover
systemctl --user stop "$trial" >/dev/null 2>&1 || true
systemctl --user reset-failed "$trial" >/dev/null 2>&1 || true
systemctl --user start "$primary"
systemctl --user start "$proxy_socket"
ready=0
for _ in $(seq 1 240); do
    if curl -fsS http://127.0.0.1:18094/health > "$out/manual-rollback-health.json" 2>/dev/null; then ready=1; break; fi
    sleep 1
done
systemctl --user show "$primary" -p ActiveState -p SubState -p MainPID -p NRestarts -p MemorySwapCurrent -p MemorySwapPeak > "$out/manual-rollback-service.txt"
[[ $ready == 1 ]]
jq -e '.status == "ok" and .model == "gemma-4-e4b-qat-mtp-zero-copy" and .vulkan_model_resident == true' "$out/manual-rollback-health.json"
for x in ActiveState=active SubState=running NRestarts=0 MemorySwapCurrent=0 MemorySwapPeak=0; do grep -Fx "$x" "$out/manual-rollback-service.txt"; done
printf 'primary_live=1\nurl=http://192.168.1.70:8094/\n'
