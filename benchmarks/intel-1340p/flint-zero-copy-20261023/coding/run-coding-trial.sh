#!/bin/bash
set -euo pipefail
ws=/var/home/agent/workspace
run="$ws/tmp/llama-cpp/runs/flint-trial-20261023-be9528654612"
export TMPDIR="$run/tmp" TMP="$run/tmp" TEMP="$run/tmp" BUN_TMPDIR="$run/tmp"
label="$1";mode="$2";cache="$3";task="$4";model="$5"
name="flint-$label";bin="$ws/tmp/llama-cpp/build/source-1309921403/flint-vulkan/bin/test-flint-handoff-synthetic"
if test -f "$run/$label.exit";then echo "Refusing duplicate completed $label";exit 1;fi
reserve=$(awk '/MemAvailable/{print $2}' /proc/meminfo);test "$reserve" -ge 6291456
! podman ps --format '{{.Names}}'|grep -E '^flint-'
args=();if test "$mode" = gpu;then args+=(--device /dev/dri/renderD128);fi
for key in FLINT_CODING_CASE FLINT_CODING_OUTPUT FLINT_BATCH_THREADS FLINT_THREADS FLINT_UBATCH FLINT_FA FLINT_POOL FLINT_ASYNC FLINT_PROMPT FLINT_DECODE FLINT_REPS;do
 if test -n "${!key:-}";then args+=(-e "$key=${!key}");fi
done
prefix="";if test -n "${FLINT_CPUSET:-}";then
 [[ "$FLINT_CPUSET" =~ ^[0-9,-]+$ ]];prefix="taskset -c $FLINT_CPUSET "
fi
podman run -d --name "$name" --network none --cpus=${FLINT_CPUS:-4} --memory=20g --memory-swap=20g --pids-limit=256 --security-opt label=disable --userns=keep-id "${args[@]}" -v "$ws:$ws" -w "$run" -e TMPDIR="$run/tmp" -e TMP="$run/tmp" -e TEMP="$run/tmp" -e OMP_NUM_THREADS=${FLINT_THREADS:-4} --entrypoint /bin/bash localhost/llama-intel-build:fedora44 -lc "set +e;timeout --signal=TERM --kill-after=15s 300s ${prefix}'$bin' '$model' '$mode' '$cache' '$task' > '$run/$label.log' 2>&1;rc=\$?;for k in memory.current memory.peak memory.swap.current memory.events cpu.max cpu.stat cpuset.cpus.effective;do echo ===\$k;cat /sys/fs/cgroup/\$k;done > '$run/$label-cgroup.txt';echo \$rc > '$run/$label.exit';exit \$rc" > "$run/$label-container.id"
podman inspect "$name" > "$run/$label-container-config.json"
trap 'if podman container exists "$name";then podman kill "$name" >/dev/null 2>&1||true;fi' INT TERM
printf 'epoch,host_available_kb,cgroup_current,cgroup_swap\n' > "$run/$label-monitor.csv"
while test "$(podman inspect "$name" --format '{{.State.Status}}')" = running;do
 available=$(awk '/MemAvailable/{print $2}' /proc/meminfo)
 read -r mem swap < <(podman exec "$name" sh -c 'echo $(cat /sys/fs/cgroup/memory.current) $(cat /sys/fs/cgroup/memory.swap.current)' 2>/dev/null||echo '0 0')
 printf '%s,%s,%s,%s\n' "$(date +%s)" "$available" "$mem" "$swap" >> "$run/$label-monitor.csv"
 if test "$available" -lt 6291456 || test "${swap:-0}" -gt 0;then echo 'resource guard' > "$run/$label-abort.txt";podman kill "$name" >/dev/null;break;fi
 sleep 2
done
podman inspect "$name" --format '{{.State.Status}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}} pid={{.State.Pid}}' > "$run/$label-after.txt"
cat "$run/$label-after.txt"
podman rm "$name" >/dev/null
trap - INT TERM
test -f "$run/$label.exit" && test "$(cat "$run/$label.exit")" = 0
