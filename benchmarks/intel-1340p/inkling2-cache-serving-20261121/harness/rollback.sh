#!/bin/bash
set -euo pipefail
ws=/var/home/agent/workspace
run="$ws/tmp/llama-cpp/runs/inkling-cache-serving-20261121-1dadee62b"
parent="$ws/tmp/llama-cpp/runs/inkling-simd-serving-20261121-1dadee62b"
runtime="$ws/tmp/llama-cpp/runs/upstream-review-20261114-976edc030/private-podman.sh"
name=inkling2-mini-simd-webui-20261121
export XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus
export TMPDIR="$run/tmp" TMP="$run/tmp" TEMP="$run/tmp" BUN_TMPDIR="$run/tmp"
trap 'rc=$?;echo "$rc" > "$run/rollback.exit"' EXIT
p(){ bash "$runtime" "$@"; }
if p container exists inkling2-mini-cache768-webui-20261121;then test "$(p inspect inkling2-mini-cache768-webui-20261121 --format '{{.State.Running}}')" = false;fi
for old in inkling2-mini-webui-20261120 gemma4-base-webui-20261114;do test "$(p inspect "$old" --format '{{.State.Running}}')" = false;done
test "$(p inspect "$name" --format '{{.Id}}')" = "$(cat "$parent/serve-simd8.container.id")"
if [[ $(p inspect "$name" --format '{{.State.Running}}') != true ]];then
 systemctl --user reset-failed "$name.service" >/dev/null 2>&1 || true
 for ((i=0;i<20;i++));do state=$(systemctl --user show "$name.service" -p LoadState --value 2>/dev/null || true);[[ "$state" = not-found || -z "$state" ]] && break;sleep 1;done
 systemd-run --user --unit "$name" --property=MemoryMax=24964497408 --property=MemorySwapMax=0 --property=CPUQuota=1600% --property=TasksMax=1024 --property=Delegate=yes --property=Restart=no --property=TimeoutStopSec=120 --property="StandardOutput=append:$run/rollback-supervisor.log" --property="StandardError=append:$run/rollback-supervisor.log" /bin/bash "$parent/unit-start.sh"
fi
ready=0
for ((i=0;i<180;i++));do
 if curl -fsS --max-time 2 http://192.168.1.70:11434/health > "$run/rollback-health.json" 2>/dev/null;then ready=1;break;fi
 sleep 2
done
test "$ready" = 1
bash "$parent/verify-service-published.sh" cache768-rollback > "$run/rollback-native-verification.log"
p inspect "$name" > "$run/rollback.container.json"
/opt/piclaw/current/bun/bin/bun "$run/verify-profile.mjs" rollback parent
/opt/piclaw/current/bun/bin/bun "$run/verify-ready.mjs" > "$run/rollback-ready.log"
cp -p "$run/post-restart-ready.json" "$run/rollback-ready.json"
echo 'PASS accepted SIMD4/16/cache256 parent restored with native caps, unchanged argv/UI and READY; original Inkling/Gemma untouched'
