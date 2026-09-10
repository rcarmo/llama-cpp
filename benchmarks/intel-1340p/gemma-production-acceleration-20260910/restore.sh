#!/usr/bin/env bash
set -euo pipefail
export XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus
systemctl --user stop gemma-hybrid-staging.service || true
systemctl --user start llama-gemma-local-provider.service
for i in {1..120}; do
 if curl -fsS --max-time 2 http://127.0.0.1:8091/health >/dev/null 2>&1; then exit 0; fi
 sleep 1
done
exit 1
