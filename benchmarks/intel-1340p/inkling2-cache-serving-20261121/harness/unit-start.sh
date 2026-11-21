#!/bin/bash
set -euo pipefail
ws=/var/home/agent/workspace
run="$ws/tmp/llama-cpp/runs/inkling-cache-serving-20261121-1dadee62b"
runtime="$ws/tmp/llama-cpp/runs/upstream-review-20261114-976edc030/private-podman.sh"
name=inkling2-mini-cache768-webui-20261121
export TMPDIR="$run/tmp" TMP="$run/tmp" TEMP="$run/tmp"
export XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus
p(){ bash "$runtime" "$@"; }
owned=0
stop(){ (( owned )) || return 0;p stop --time 15 "$name" >/dev/null 2>&1 || true; }
finish(){
 rc=$?;trap - EXIT
 if (( rc != 0 ));then
  stop;echo "$rc" > "$run/unit-failure.exit"
  if [[ -f "$run/accepted.json" ]];then /bin/bash "$run/rollback.sh" >> "$run/automatic-rollback.log" 2>&1 || true;fi
 fi
 exit "$rc"
}
trap finish EXIT
trap 'stop;exit 0' TERM INT HUP
sha256sum -c "$run/runtime.sha256" > "$run/unit-integrity.log"
test "$(p inspect inkling2-mini-simd-webui-20261121 --format '{{.State.Running}}')" = false
test "$(p inspect inkling2-mini-webui-20261120 --format '{{.State.Running}}')" = false
test "$(p inspect gemma4-base-webui-20261114 --format '{{.State.Running}}')" = false
if p container exists "$name";then
 test "$(p inspect "$name" --format '{{.Id}}')" = "$(cat "$run/serve-cache768.container.id")"
 test "$(p inspect "$name" --format '{{.State.Running}}')" = false
 owned=1;p start "$name"
else
 test ! -e "$run/serve-cache768.container.id"
 owned=1;bash "$run/launch.sh"
fi
pid=$(p inspect "$name" --format '{{.State.Pid}}')
cg=$(awk -F: '$1==0{print $3}' /proc/"$pid"/cgroup)
{ echo "container_root_pid=$pid";echo "cgroup=$cg";for k in memory.max memory.swap.max cpu.max;do printf '%s ' "$k";cat "/sys/fs/cgroup$cg/$k";done; } > "$run/kernel-start.txt"
test "$(cat "/sys/fs/cgroup$cg/memory.max")" = 24964497408
test "$(cat "/sys/fs/cgroup$cg/memory.swap.max")" = 0
test "$(cat "/sys/fs/cgroup$cg/cpu.max")" = '1600000 100000'
ready=0
for ((i=0;i<180;i++));do
 if curl -fsS --max-time 2 http://192.168.1.70:11434/health > "$run/health-start.json" 2>/dev/null;then ready=1;break;fi
 test "$(p inspect "$name" --format '{{.State.Running}}')" = true || break
 sleep 2
done
test "$ready" = 1
code=$(p wait "$name")
echo "$code" > "$run/container-exit.txt"
test "$code" = 0
