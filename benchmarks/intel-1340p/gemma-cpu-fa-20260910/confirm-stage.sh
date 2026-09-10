#!/usr/bin/env bash
set -euo pipefail
export XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus GEMMA_MAINTENANCE_APPROVED=20260910
root=/var/home/agent/workspace/reports/gemma-cpu-fa-20260910
curl -fsS --max-time 5 http://127.0.0.1:8091/slots|jq -e 'all(.[];.is_processing==false)'
curl -fsS --max-time 5 http://127.0.0.1:8092/api/jobs|jq -e 'all(.[];.state=="completed" or .state=="failed" or .state=="cancelled")'
systemctl --user stop llama-gemma-local-provider.service
profiles=(on-patched-default on-fused on-fused on-patched-default on-fused on-patched-default on-patched-default on-fused)
for i in "${!profiles[@]}"; do bun "$root/cpu-fa.ts" confirm64 "${profiles[$i]}" "$i"; done
