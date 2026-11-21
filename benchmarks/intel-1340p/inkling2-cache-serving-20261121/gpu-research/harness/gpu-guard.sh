#!/bin/bash
# Include full backing, non-model RSS, GPU residency and 256 MiB for supervisors.
set -uo pipefail
run=$1; label=$2; model=$3; projector=$4; limit=$5; gpu=$6; shift 6
backing=$(( $(stat -c %s "$model") + $(stat -c %s "$projector") ))
child=0; reason=""
stop_child() {
    (( child > 0 )) || return
    kill -TERM "$child" 2>/dev/null || true
    for ((i=0;i<10;i++)); do kill -0 "$child" 2>/dev/null || return; sleep 1; done
    kill -KILL "$child" 2>/dev/null || true
}
trap 'reason=supervisor_signal;stop_child' TERM INT HUP
printf '%q ' "$@" > "$run/$label.argv"; printf '\n' >> "$run/$label.argv"
"$@" &
child=$!
echo "$child" > "$run/$label.native.pid"
printf 'epoch,host_available_kib,process_swap_kib,cgroup_bytes,cgroup_swap_bytes,estimated_total_bytes,rss_kib,mapped_model_kib,gpu_accounted_bytes,gpu_engine_ns,gpu_clients\n' > "$run/$label.monitor.csv"
while kill -0 "$child" 2>/dev/null; do
    available=$(awk '/MemAvailable:/{print $2}' /proc/meminfo)
    swap=$(awk '/VmSwap:/{print $2}' /proc/"$child"/status 2>/dev/null)
    memory=$(cat /sys/fs/cgroup/memory.current); cgswap=$(cat /sys/fs/cgroup/memory.swap.current)
    values=$(awk -v model="$model" -v projector="$projector" '/^[0-9a-f]+-[0-9a-f]+ /{mapped=index($0,model)>0||index($0,projector)>0} /^Rss:/{total+=$2;if(mapped)weights+=$2} END{print total+0,weights+0}' /proc/"$child"/smaps 2>/dev/null)
    drm='0 0 0 0'
    if (( gpu != 0 ));then
    drm=$(bash "$run/drm-snapshot.sh" "$child" "$run/drm-account.awk")
    fi
    if ! kill -0 "$child" 2>/dev/null; then break; fi
    read -r rss mapped <<< "$values"
    read -r gpumem gpuns gpuclients gpuknown <<< "$drm"
    estimated=$((backing+(${rss:-0}-${mapped:-0})*1024+${gpumem:-0}+268435456))
    printf '%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s\n' "$(date +%s)" "$available" "${swap:-unknown}" "$memory" "$cgswap" "$estimated" "${rss:-unknown}" "${mapped:-unknown}" "${gpumem:-0}" "${gpuns:-0}" "${gpuclients:-0}" >> "$run/$label.monitor.csv"
    if [[ -z "$swap" || -z "$rss" || -z "$gpumem" ]] || (( available < 2097152 || swap > 0 || cgswap > 0 || estimated > limit || memory > limit )); then
        reason="resource_guard available=$available swap=$swap rss=$rss gpu_snapshot=${drm:-missing} cgroup_swap=$cgswap estimated=$estimated cgroup=$memory limit=$limit"
        stop_child; break
    fi
    # A Vulkan client without supported residency counters must not run unaccounted.
    if (( gpu != 0 && ${gpuclients:-0} > ${gpuknown:-0} )); then
        reason="gpu_residency_unavailable clients=$gpuclients known=$gpuknown"
        stop_child; break
    fi
    sleep 2
done
wait "$child"; rc=$?
for k in memory.max memory.peak memory.swap.max memory.swap.current memory.events cpu.max cpu.stat; do echo ===$k; cat /sys/fs/cgroup/$k; done > "$run/$label.cgroup.txt"
if [[ -n "$reason" ]]; then echo "$reason" > "$run/$label.guard-stop.txt"; rc=125; fi
echo "$rc" > "$run/$label.exit"
exit "$rc"
