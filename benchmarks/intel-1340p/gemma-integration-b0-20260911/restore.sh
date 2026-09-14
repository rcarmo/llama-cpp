#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Restore current smallbatchhybrid and clean only this codingcampaign's trialcontainers","kind":"mutating","weight":"standard","role":"entrypoint"}
set -euo pipefail
export XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus
root=/var/home/agent/workspace/reports/gemma-integration-b0-20260911
cmp "$root/baseline/hybrid.service" /var/home/agent/.config/systemd/user/llama-gemma-local-provider.service
cmp "$root/baseline/hybrid.json" /var/home/agent/.local/share/llama-gemma-hybrid/releases/20260911-score3-stopped/config.json
podman --root /var/home/agent/workspace/projects/.podman-llama-storage --runroot /var/home/agent/workspace/projects/.podman-llama-run --storage-driver vfs --cgroup-manager=cgroupfs rm -f gemma-integration-no-build >/dev/null 2>&1 || true
systemctl --user start llama-gemma-local-provider.service
for i in {1..120}; do if curl -fsS --max-time 2 http://127.0.0.1:8091/health >/dev/null 2>&1; then curl -fsS --max-time 2 http://127.0.0.1:8091/hybrid/status > "$root/restored-hybrid.json";systemctl --user show llama-gemma-local-provider.service -p MainPID -p ActiveState -p NRestarts > "$root/restored-service.txt";exit 0;fi;sleep 1;done
exit 1
