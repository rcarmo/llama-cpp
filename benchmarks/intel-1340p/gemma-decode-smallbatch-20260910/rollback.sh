#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Revert decode candidate to saved working hybrid release, not historicalCPU-onlyservice","kind":"mutating","weight":"standard","role":"entrypoint"}
set -euo pipefail
export XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus
root=/var/home/agent/workspace/reports/gemma-decode-smallbatch-20260910
systemctl --user stop llama-gemma-local-provider.service
cp "$root/rollback/hybrid.service" /var/home/agent/.config/systemd/user/llama-gemma-local-provider.service
systemctl --user daemon-reload
systemctl --user reset-failed llama-gemma-local-provider.service || true
systemctl --user start llama-gemma-local-provider.service
for i in {1..120}; do if curl -fsS --max-time 2 http://127.0.0.1:8091/hybrid/status > "$root/rolled-back-status.json" 2>/dev/null; then exit 0; fi;sleep 1;done
exit 1
