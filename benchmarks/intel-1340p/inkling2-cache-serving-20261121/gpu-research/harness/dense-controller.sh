#!/bin/bash
set -euo pipefail
ws=/var/home/agent/workspace
run="/var/home/agent/workspace/tmp/llama-cpp/runs/inkling-gpu-cache768-20261121-1dadee62b/dense"
shared="$ws/tmp/llama-cpp/runs/inkling-cache-gpu-20261121-1dadee62b"
serving="$ws/tmp/llama-cpp/runs/inkling-cache-serving-20261121-1dadee62b"
runtime="$ws/tmp/llama-cpp/runs/upstream-review-20261114-976edc030/private-podman.sh"
name=inkling2-mini-cache768-webui-20261121
bun=/opt/piclaw/current/bun/bin/bun
export XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus
export TMPDIR="$run/tmp/controller" TMP="$run/tmp/controller" TEMP="$run/tmp/controller" BUN_TMPDIR="$run/tmp/controller"
export BUN_RUNTIME_TRANSPILER_CACHE_PATH="$ws/tmp/llama-cpp/cache/inkling-opt-native/bun-runtime"
p(){ bash "$runtime" "$@"; }
phase=${1:?};shift
[[ "$phase" =~ ^[a-z0-9-]+$ ]];test "$#" -gt 0
exec 9>"$shared/native.lock";flock -n 9
# This extra lock prevents another continuation in the new namespace.
exec 8>"$run/native.lock";flock -n 8
test ! -e "$run/$phase.complete.exit"
test "$(cat "$serving/cutover.exit")" = 0;test -f "$serving/accepted.json"
sha256sum -c "$run/frozen.sha256" > "$run/$phase.harness-integrity.log"
sha256sum -c "$serving/serving-frozen.sha256" > "$run/$phase.parent-harness-integrity.log"
sha256sum -c "$serving/runtime.sha256" > "$run/$phase.parent-runtime-integrity.log"
sha256sum -c "$run/gpu-runtime.sha256" > "$run/$phase.gpu-runtime-integrity.log"
cg=$(awk -F: '$1==0{print $3}' /proc/self/cgroup)
for spec in 'memory.max 24964497408' 'memory.swap.max 0' 'cpu.max 1600000 100000';do test "$(cat "/sys/fs/cgroup$cg/${spec%% *}")" = "${spec#* }";done
for old in inkling2-mini-simd-webui-20261121 inkling2-mini-webui-20261120 gemma4-base-webui-20261114;do test "$(p inspect "$old" --format '{{.State.Running}}')" = false;done
test "$(p inspect "$name" --format '{{.State.Running}}')" = true
test "$(p inspect "$name" --format '{{.Id}}')" = "$(cat "$serving/serve-cache768.container.id")"
test "$(cat "$serving/serve-cache768.container.id")" = 4c82176224511e875c63e78af85c94b4c8553e0e23b4cd14afd518c323eacce4
p inspect "$name" > "$run/$phase.production-before.json"
cp -p "$run/$phase.production-before.json" "$serving/$phase-admission.container.json"
"$bun" "$serving/verify-profile.mjs" "$phase-admission" > "$run/$phase.parent-profile-admission.log"
production_pid=$(p top "$name" hpid comm |awk '$2~/^llama-server/ && !found {print $1;found=1}')
test -n "$production_pid"
other_native(){
 local allowed=${1:-0} pid comm pcg owned_name owned_pid owned_cg
 while read -r pid comm;do
  [[ "$pid" = "$allowed" ]] && continue
  pcg=$(awk -F: '$1==0{print $3}' "/proc/$pid/cgroup" 2>/dev/null || true)
  [[ -z "$pcg" || "$pcg" = "$cg" || "$pcg" = "$cg/"* ]] && continue
  if test -s "$run/active-container.txt";then
   owned_name=$(cat "$run/active-container.txt")
   [[ "$owned_name" =~ ^inkling-cg-g768-[a-z0-9-]+$ ]] || return 1
   owned_pid=$(p inspect "$owned_name" --format '{{.State.Pid}}' 2>/dev/null || true)
   if [[ "$owned_pid" =~ ^[1-9][0-9]*$ ]];then
    owned_cg=$(awk -F: '$1==0{print $3}' "/proc/$owned_pid/cgroup" 2>/dev/null || true)
    [[ -n "$owned_cg" && ( "$pcg" = "$owned_cg" || "$pcg" = "$owned_cg/"* ) ]] && continue
   fi
  fi
  printf '%s %s\n' "$pid" "$comm"
 done < <(ps -eo pid=,comm= |awk '$2~/^(llama-server|llama-bench|llama-cli|replay-audited|whisper-cli|diar-server|cc1plus|cc1|clang[-+0-9]*|gcc|g\+\+|glslc|ninja|cmake)$/ {print $1,$2}')
}
other_native "$production_pid" > "$run/$phase.native-admission.txt"
test ! -s "$run/$phase.native-admission.txt"
maintenance=0;current="";thermal=0;watchdog=0;controller_pid=$$
finish(){
 rc=$?;trap - EXIT TERM INT HUP
 for pid in "$watchdog" "$thermal";do if (( pid ));then kill "$pid" 2>/dev/null || true;wait "$pid" 2>/dev/null || true;fi;done
 if (( maintenance ));then
  restore=0
  if [[ -n "$current" ]] && p container exists "$current";then
   p stop --time 20 "$current" >> "$run/$phase.cleanup.log" 2>&1 || true
   test "$(p inspect "$current" --format '{{.State.Running}}')" = false || restore=1
  fi
  if (( !restore )) && [[ $(p inspect "$name" --format '{{.State.Running}}') != true ]];then
   systemctl --user reset-failed "$name.service" >/dev/null 2>&1 || true
   for ((i=0;i<20;i++));do state=$(systemctl --user show "$name.service" -p LoadState --value 2>/dev/null || true);[[ "$state" = not-found || -z "$state" ]] && break;sleep 1;done
   systemd-run --user --unit "$name" --property=MemoryMax=24964497408 --property=MemorySwapMax=0 --property=CPUQuota=1600% --property=TasksMax=1024 --property=Delegate=yes --property=Restart=no --property=TimeoutStopSec=120 --property="StandardOutput=append:$run/$phase.restored-supervisor.log" --property="StandardError=append:$run/$phase.restored-supervisor.log" /bin/bash "$serving/unit-start.sh" || restore=1
  fi
  ready=0
  if (( !restore ));then
   for ((i=0;i<180;i++));do
    if curl -fsS --max-time 2 http://192.168.1.70:11434/health > "$run/$phase.restored-health.json" 2>/dev/null;then ready=1;break;fi
    sleep 2
   done
  fi
  if (( ready ));then
   if bash "$serving/verify-service.sh" "restore-$phase" > "$run/$phase.restored-verification.log" 2>&1 && "$bun" "$serving/verify-profile.mjs" "restore-$phase" >> "$run/$phase.restored-verification.log" 2>&1;then
    mkdir -p "$run/restore-$phase-api"
    "$bun" "$run/check-restored-api.mjs" "$run/restore-$phase-api" > "$run/$phase.restored-api.log" 2>&1 || restore=1
    cp -p "$run/restore-$phase-api/api-verification.json" "$run/$phase.restored-api.json" || restore=1
    p inspect "$name" > "$run/$phase.production-after.json" || restore=1
    test "$(p inspect "$name" --format '{{.Id}}')" = "$(cat "$serving/serve-cache768.container.id")" || restore=1
   else restore=1;fi
  else restore=1;fi
  echo "$restore" > "$run/$phase.restoration.exit";(( !restore )) || rc=1
 fi
 echo "$rc" > "$run/$phase.complete.exit"
 exit "$rc"
}
trap finish EXIT
trap 'exit 143' TERM INT HUP
curl -fsS --max-time 5 http://192.168.1.70:11434/slots > "$run/$phase.slots-admission.json"
jq -e 'all(.[];.is_processing==false)' "$run/$phase.slots-admission.json" >/dev/null
curl --compressed -fsS --max-time 10 http://192.168.1.70:11434/ > "$run/$phase.parent.index.html"
cmp "$serving/original.index.html" "$run/$phase.parent.index.html"
maintenance=1;date -u +%FT%TZ > "$run/$phase.maintenance-started"
systemctl --user stop "$name.service"
test "$(p inspect "$name" --format '{{.State.Running}}')" = false
sleep 3
(
 trap - EXIT
 printf 'epoch,path,label,millicelsius\n' > "$run/$phase.thermal.csv"
 while true;do
  for dir in /sys/class/hwmon/hwmon*;do
   test -f "$dir/name" || continue;chip=$(cat "$dir/name");case "$chip" in coretemp|acpitz|i915) ;; *) continue;;esac
   for file in "$dir"/temp*_input;do test -f "$file" || continue;printf '%s,%s,%s,%s\n' "$(date +%s)" "$file" "$chip" "$(cat "$file")" >> "$run/$phase.thermal.csv";done
  done
  sleep 5
 done
) & thermal=$!
(
 trap - EXIT
 while true;do
  other_native > "$run/$phase.native-current.txt"
  if test -s "$run/$phase.native-current.txt";then cp -p "$run/$phase.native-current.txt" "$run/$phase.contention.txt";kill -TERM "$controller_pid";exit 0;fi
  sleep 2
 done
) & watchdog=$!
for spec in "$@";do
 label=${spec%%:*};config=${spec#*:};[[ "$label" =~ ^[a-z0-9-]+$ && "$config" =~ ^(fallback|group6|dense)$ ]]
 test ! -e "$run/$label.exit"
 current="inkling-cg-$label"
 printf '%s\n' "$current" > "$run/active-container.txt"
 echo "START $label $(date -u +%FT%TZ)"
 bash "$run/trial.sh" "$label" "$config"
 test "$(cat "$run/$label.exit")" = 0
 current="";rm -f "$run/active-container.txt";echo "DONE $label $(date -u +%FT%TZ)";sleep 3
done
