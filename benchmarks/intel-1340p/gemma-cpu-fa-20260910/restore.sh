#!/usr/bin/env bash
set -euo pipefail
export XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus
root=/var/home/agent/workspace/reports/gemma-cpu-fa-20260910
# Kill only this campaign's named build container if the guarded build was interrupted.
podman --root /var/home/agent/workspace/projects/.podman-llama-storage --runroot /var/home/agent/workspace/projects/.podman-llama-run --storage-driver vfs --cgroup-manager=cgroupfs rm -f gemma-context-swa-build >/dev/null 2>&1 || true
systemctl --user start llama-gemma-local-provider.service
for i in $(seq 1 120); do
 if curl -fsS --max-time 2 http://127.0.0.1:8091/health > "$root/restored-health.json" 2>/dev/null; then
  systemctl --user show llama-gemma-local-provider.service -p MainPID -p ActiveState -p NRestarts > "$root/restored-service.txt"
  curl -fsS http://127.0.0.1:8091/slots | jq 'map({id,n_ctx,is_processing})' > "$root/restored-slots.json"
  date -Is > "$root/restored-at.txt"; exit 0
 fi
 sleep 1
done
exit 1
