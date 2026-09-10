#!/usr/bin/env bash
set -euo pipefail
export XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus
root=/var/home/agent/workspace/reports/gemma-production-acceleration-20260910
curl -fsS --max-time 5 http://127.0.0.1:8091/slots | jq -e 'length==2 and all(.[];.is_processing==false)'
curl -fsS --max-time 5 http://127.0.0.1:8092/api/jobs | jq -e 'all(.[];.state=="completed" or .state=="failed" or .state=="cancelled")'
systemctl --user stop llama-gemma-local-provider.service
systemd-run --user --unit=gemma-hybrid-staging --property=Restart=on-failure --property=RestartSec=2 --property=RuntimeMaxSec=20min --property=KillMode=control-group --property=TimeoutStopSec=25 --property=WorkingDirectory=/var/home/agent/workspace --setenv="PATH=$PATH" --property="StandardOutput=append:$root/supervisor.log" --property="StandardError=append:$root/supervisor.log" /opt/piclaw/current/bun/bin/bun /var/home/agent/workspace/projects/llama-cpp/tools/gemma-hybrid/main.ts "$root/staging.json"
bun "$root/native-test.ts"
