#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Run one guarded FP32 microbatch interaction block under approved maintenance","kind":"mutating","weight":"heavy","role":"entrypoint"}
set -euo pipefail
export XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus GEMMA_MAINTENANCE_APPROVED=20260910
root=/var/home/agent/workspace/reports/gemma-f32-batch-20260910
curl -fsS --max-time 5 http://127.0.0.1:8091/slots | jq -e 'length==2 and all(.[];.is_processing==false)'
curl -fsS --max-time 5 http://127.0.0.1:8092/api/jobs | jq -e 'all(.[];.state=="completed" or .state=="failed" or .state=="cancelled")'
systemctl --user stop llama-gemma-local-provider.service
for i in {0..7}; do bun "$root/batch-screen.ts" "$i"; done
