#!/usr/bin/env bash
set -euo pipefail
export XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus
root=/var/home/agent/workspace/reports/gemma-production-acceleration-20260910
curl -fsS --max-time 5 http://127.0.0.1:8091/hybrid/status | jq -e '.active==false and .queued==0'
curl -fsS --max-time 5 http://127.0.0.1:8092/api/jobs | jq -e 'all(.[];.state=="completed" or .state=="failed" or .state=="cancelled")'
systemctl --user stop llama-gemma-local-provider.service
sed -i 's@releases/20260910/@releases/20260910-sse1/@g' /var/home/agent/.config/systemd/user/llama-gemma-local-provider.service
systemctl --user daemon-reload
systemctl --user start llama-gemma-local-provider.service
bun "$root/final-production-smoke.ts"
bun "$root/native-stream-smoke.ts"
date -Is > "$root/SSE_UPDATE_OK"
