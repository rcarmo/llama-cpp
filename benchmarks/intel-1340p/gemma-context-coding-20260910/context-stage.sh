#!/usr/bin/env bash
set -euo pipefail
export XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus GEMMA_MAINTENANCE_APPROVED=20260910 PROBE_SUFFIX=-r1
root=/var/home/agent/workspace/reports/gemma-context-coding-20260910
curl -fsS --max-time 5 http://127.0.0.1:8091/slots|jq -e 'all(.[];.is_processing==false)'
curl -fsS --max-time 5 http://127.0.0.1:8092/api/jobs|jq -e 'all(.[];.state=="completed" or .state=="failed" or .state=="cancelled")'
systemctl --user stop llama-gemma-local-provider.service
bun "$root/compact-probe.ts" hybrid-baseline
bun "$root/long64.ts"
