#!/bin/bash
set -euo pipefail
ws=/var/home/agent/workspace
run="$ws/tmp/llama-cpp/runs/inkling-cache-serving-20261121-1dadee62b"
parent="$ws/tmp/llama-cpp/runs/inkling-simd-serving-20261121-1dadee62b"
experiment="$ws/tmp/llama-cpp/runs/inkling-cache-gpu-20261121-1dadee62b"
runtime="$ws/tmp/llama-cpp/runs/upstream-review-20261114-976edc030/private-podman.sh"
name=inkling2-mini-cache768-webui-20261121
bun=/opt/piclaw/current/bun/bin/bun
export XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus
export TMPDIR="$run/tmp" TMP="$run/tmp" TEMP="$run/tmp" BUN_TMPDIR="$run/tmp"
export BUN_RUNTIME_TRANSPILER_CACHE_PATH="$ws/tmp/llama-cpp/cache/inkling-opt-native/bun-runtime" PLAYWRIGHT_BROWSERS_PATH="$ws/tmp/llama-cpp/cache/playwright"
p(){ bash "$runtime" "$@"; }
maintenance=0
finish(){
 rc=$?;trap - EXIT TERM INT HUP
 if (( rc != 0 && maintenance ));then
  systemctl --user stop "$name.service" >/dev/null 2>&1 || true
  if p container exists "$name";then p stop --time 20 "$name" >/dev/null 2>&1 || true;fi
  bash "$run/rollback.sh" >> "$run/cutover-rollback.log" 2>&1 || rc=1
 fi
 echo "$rc" > "$run/cutover.exit";exit "$rc"
}
trap finish EXIT
trap 'exit 143' TERM INT HUP
test ! -e "$run/cutover.exit";test ! -e "$run/accepted.json"
test -x "$bun";"$bun" --version > "$run/bun-version.txt"
test "$(cat "$run/capacity-qualification.exit")" = 0
for suffix in complete restoration;do test "$(cat "$experiment/capacity-abba.$suffix.exit")" = 0;done
test ! -e "$experiment/gpu-screen.maintenance-started"
! systemctl --user is-active --quiet inkling-gpu-screen-driver-20261121.service
! systemctl --user is-active --quiet inkling-gpu-screen-20261121.service
cg=$(awk -F: '$1==0{print $3}' /proc/self/cgroup)
for spec in 'memory.max 4294967296' 'memory.swap.max 0' 'cpu.max 200000 100000';do test "$(cat "/sys/fs/cgroup$cg/${spec%% *}")" = "${spec#* }";done
sha256sum -c "$run/serving-frozen.sha256" > "$run/cutover-harness-integrity.log"
sha256sum -c "$run/runtime.sha256" > "$run/cutover-runtime-integrity.log"
! p container exists "$name"
test "$(p inspect inkling2-mini-simd-webui-20261121 --format '{{.State.Running}}')" = true
for old in inkling2-mini-webui-20261120 gemma4-base-webui-20261114;do test "$(p inspect "$old" --format '{{.State.Running}}')" = false;done
p inspect inkling2-mini-simd-webui-20261121 > "$run/parent.container.json"
"$bun" "$run/verify-profile.mjs" parent parent
curl --compressed -fsS --max-time 10 http://192.168.1.70:11434/ > "$run/original.index.html"
wait_idle(){
 for ((i=0;i<180;i++));do
  curl -fsS --max-time 5 http://192.168.1.70:11434/slots > "$run/slots-current.json"
  if jq -e 'all(.[];.is_processing==false)' "$run/slots-current.json" >/dev/null;then return 0;fi
  sleep 2
 done
 return 1
}
start_candidate(){
 systemctl --user reset-failed "$name.service" >/dev/null 2>&1 || true
 for ((i=0;i<20;i++));do state=$(systemctl --user show "$name.service" -p LoadState --value 2>/dev/null || true);[[ "$state" = not-found || -z "$state" ]] && break;sleep 1;done
 systemd-run --user --unit "$name" --property=MemoryMax=24964497408 --property=MemorySwapMax=0 --property=CPUQuota=1600% --property=TasksMax=1024 --property=Delegate=yes --property=Restart=no --property=TimeoutStopSec=120 --property="StandardOutput=append:$run/supervisor.log" --property="StandardError=append:$run/supervisor.log" /bin/bash "$run/unit-start.sh"
 ready=0
 for ((i=0;i<180;i++));do
  if curl -fsS --max-time 2 http://192.168.1.70:11434/health > "$run/health-current.json" 2>/dev/null;then ready=1;break;fi
  state=$(systemctl --user is-active "$name.service" || true);[[ "$state" = active || "$state" = activating ]] || break;sleep 2
 done
 test "$ready" = 1
}
wait_idle
cp -p "$run/slots-current.json" "$run/slots-admission.json"
maintenance=1;date -u +%FT%TZ > "$run/maintenance-started"
systemctl --user stop inkling2-mini-simd-webui-20261121.service
sleep 3
start_candidate
bash "$run/verify-service.sh" initial
"$bun" "$run/verify-profile.mjs" initial
"$bun" "$run/check-api.mjs" > "$run/api-check.log" 2>&1
"$bun" "$run/check-serving-cache.mjs" qualification-cache > "$run/cache-check.log" 2>&1
"$bun" "$run/check-vision.mjs" > "$run/vision-check.log" 2>&1
"$bun" "$run/check-browser.mjs" > "$run/browser-check.log" 2>&1
bash "$run/verify-service.sh" qualified
"$bun" "$run/verify-profile.mjs" qualified
cp -p "$run/serve-cache768.server.log" "$run/qualified-server.log"
p inspect "$name" --format '{{.Id}} {{.State.Pid}}' > "$run/before-restart.identity.txt"
wait_idle
systemctl --user stop "$name.service"
bash "$run/rollback.sh" > "$run/rollback-check.log" 2>&1
wait_idle
systemctl --user stop inkling2-mini-simd-webui-20261121.service
sleep 3
start_candidate
p inspect "$name" --format '{{.Id}} {{.State.Pid}}' > "$run/after-restart.identity.txt"
test "$(cut -d' ' -f1 "$run/before-restart.identity.txt")" = "$(cut -d' ' -f1 "$run/after-restart.identity.txt")"
test "$(cut -d' ' -f2 "$run/before-restart.identity.txt")" != "$(cut -d' ' -f2 "$run/after-restart.identity.txt")"
"$bun" "$run/verify-ready.mjs" > "$run/restart-check.log" 2>&1
bash "$run/verify-service.sh" final
"$bun" "$run/verify-profile.mjs" final
systemctl --user show "$name.service" -p ActiveState -p SubState -p Restart -p UnitFileState -p ExecStart -p MemoryMax -p MemorySwapMax -p CPUQuotaPerSecUSec > "$run/final-unit.txt"
"$bun" -e 'const fs=require("node:fs"),r=process.env.TMPDIR.replace(/\/tmp$/,""),read=n=>JSON.parse(fs.readFileSync(r+"/"+n));fs.writeFileSync(r+"/accepted.json",JSON.stringify({accepted:new Date().toISOString(),runtime_source_commit:fs.readFileSync(r+"/source-head.txt","utf8").trim(),runtime:fs.readFileSync(r+"/runtime-path.txt","utf8").trim(),profile:read("serving-profile.json"),capacity_counterbalance:read("capacity-qualified.json").summary,api:read("api-verification.json"),live_revisit:read("qualification-cache.revisit-reuse.json"),vision:read("vision-verification.json"),browser:read("browser-chat.json"),controlled_retained_restart:true,parent_SIMD_cache256_rollback_verified:true,gpu_serving:false,populated_64k_qualified:false,crash_respawn_qualified:false,no_push:true,no_boot_changes:true},null,2)+"\n");'
echo 'PASS cache768 serving adoption, exact inherited CLI/UI, API/tools/cache/cancel/vision/browser, SIMD parent rollback and retained-child restart'
