#!/usr/bin/env bash
set -euo pipefail
export XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus GEMMA_MAINTENANCE_APPROVED=20260910
root=/var/home/agent/workspace/reports/gemma-optimization-t01-d01-20260911
bun "$root/speech.ts" stopped
cmp "$root/baseline/hybrid.service" /var/home/agent/.config/systemd/user/llama-gemma-local-provider.service
curl -fsS --max-time 5 http://127.0.0.1:8091/hybrid/status | jq -e '.active==false and .queued==0'
systemctl --user stop llama-gemma-local-provider.service
bun "$root/chunk-baseline.ts"
