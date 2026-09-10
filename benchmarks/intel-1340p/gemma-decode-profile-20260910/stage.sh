#!/usr/bin/env bash
set -euo pipefail
export XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus GEMMA_MAINTENANCE_APPROVED=20260910
root=/var/home/agent/workspace/reports/gemma-decode-profile-20260910
curl -fsS --max-time 5 http://127.0.0.1:8091/hybrid/status | jq -e '.active==false and .queued==0'
curl -fsS --max-time 5 http://127.0.0.1:8092/api/jobs | jq -e 'all(.[];.state=="completed" or .state=="failed" or .state=="cancelled")'
systemctl --user stop llama-gemma-local-provider.service
bun "$root/profile.ts" mtp3
bun "$root/profile.ts" target
