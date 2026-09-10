#!/usr/bin/env bash
set -euo pipefail
export XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus GEMMA_MAINTENANCE_APPROVED=20260910
root=/var/home/agent/workspace/reports/gemma-context-coding-20260910
curl -fsS --max-time 5 http://127.0.0.1:8091/slots | jq -e 'type=="array" and all(.[];.is_processing==false)'
curl -fsS --max-time 5 http://127.0.0.1:8092/api/jobs | jq -e 'type=="array" and all(.[];.state=="completed" or .state=="failed" or .state=="cancelled")'
for p in /proc/[0-9]*/comm; do [[ $(cat "$p" 2>/dev/null || true) != whisper-cli ]] || exit 1; done
systemctl --user stop llama-gemma-local-provider.service
bun "$root/maintenance.ts" probe
