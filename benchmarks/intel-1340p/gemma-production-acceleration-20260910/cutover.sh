#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Activate approved pinned hybrid release with independent rollback timer and smoke acceptance","kind":"mutating","weight":"heavy","role":"entrypoint"}
set -euo pipefail
export XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus
root=/var/home/agent/workspace/reports/gemma-production-acceleration-20260910
release=/var/home/agent/.local/share/llama-gemma-hybrid/releases/20260910
test ! -e "$root/PROMOTED"
curl -fsS --max-time 5 http://127.0.0.1:8091/slots | jq -e 'length==2 and all(.[];.is_processing==false)'
curl -fsS --max-time 5 http://127.0.0.1:8092/api/jobs | jq -e 'all(.[];.state=="completed" or .state=="failed" or .state=="cancelled")'
# Independent timer restores the prior unit even if this controller is killed.
systemd-run --user --unit=gemma-hybrid-cutover-rollback --on-active=7min /usr/bin/bash "$root/cutover-stop.sh"
systemctl --user stop llama-gemma-local-provider.service
cat > /var/home/agent/.config/systemd/user/llama-gemma-local-provider.service <<'UNIT'
[Unit]
Description=Gemma E4B FP32 Vulkan cold prefill with retained CPU MTP decoding
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=120
StartLimitBurst=4
[Service]
Type=simple
WorkingDirectory=/var/home/agent/workspace
ExecStart=/opt/piclaw/current/bun/bin/bun /var/home/agent/.local/share/llama-gemma-hybrid/releases/20260910/code/main.ts /var/home/agent/.local/share/llama-gemma-hybrid/releases/20260910/config.json
Restart=on-failure
RestartSec=3
TimeoutStopSec=30
KillMode=control-group
UMask=0077
[Install]
WantedBy=default.target
UNIT
systemctl --user daemon-reload
systemctl --user start llama-gemma-local-provider.service
bun "$root/production-smoke.ts"
date -Is > "$root/PROMOTED"
systemctl --user stop gemma-hybrid-cutover-rollback.timer
systemctl --user show llama-gemma-local-provider.service -p ActiveState -p MainPID -p NRestarts > "$root/production-service.txt"
systemctl --user cat llama-gemma-local-provider.service > "$root/production-service.unit"
