#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Promote verified smallbatchdecode CPUlibrary with timedhybridrollback and nativeSSEtoolacceptance","kind":"mutating","weight":"heavy","role":"entrypoint"}
set -euo pipefail
export XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus
root=/var/home/agent/workspace/reports/gemma-decode-attn4-20260911
test ! -e "$root/PROMOTED"
curl -fsS --max-time 5 http://127.0.0.1:8091/hybrid/status | jq -e '.active==false and .queued==0'
curl -fsS --max-time 5 http://127.0.0.1:8092/api/jobs | jq -e 'all(.[];.state=="completed" or .state=="failed" or .state=="cancelled")'
systemd-run --user --unit=gemma-attn4-cutover-rollback --on-active=7min /usr/bin/bash "$root/cutover-stop.sh"
systemctl --user stop llama-gemma-local-provider.service
sed -i 's@releases/20260910-smallbatch/@releases/20260911-attn4/@g' /var/home/agent/.config/systemd/user/llama-gemma-local-provider.service
systemctl --user daemon-reload
systemctl --user start llama-gemma-local-provider.service
bun "$root/production-smoke.ts"
date -Is > "$root/PROMOTED"
systemctl --user stop gemma-attn4-cutover-rollback.timer
systemctl --user show llama-gemma-local-provider.service -p MainPID -p ActiveState -p NRestarts > "$root/production-service.txt"
systemctl --user cat llama-gemma-local-provider.service > "$root/production-service.unit"
