#!/bin/bash
# SCRIPT_JDOC: {"summary":"Run one prefill profile and capture process, cgroup and DRM memory at explicit checkpoints","kind":"mixed","weight":"heavy","role":"entrypoint"}
set -euo pipefail
mkdir -p "$RUN_OUT/checkpoints"
export QWEN_MEMORY_CHECKPOINT_DIR="$RUN_OUT/checkpoints"
"$RUN_BINARY" "$RUN_MODE" "$RUN_MODEL" "$RUN_TOKENS" "${RUN_CHUNK:-256}" "${RUN_UBATCH:-${RUN_CHUNK:-256}}" > "$RUN_OUT/run.log" 2>&1 &
pid=$!
printf '%s\n' "$pid" > "$RUN_OUT/pid"
cleanup() { kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; }
trap cleanup INT TERM
case "$RUN_MODE" in
    cpu|vulkan) phases=(models_loaded contexts_ready prefill_done) ;;
    handoff) phases=(models_loaded contexts_ready prefill_done destination_ready handoff_done source_released) ;;
    *) exit 2 ;;
esac
for phase in "${phases[@]}"; do
    ready="$RUN_OUT/checkpoints/$phase.ready"
    for _ in $(seq 1 24000); do
        [[ -e "$ready" ]] && break
        kill -0 "$pid" 2>/dev/null || { echo "process exited before $phase" >&2; wait "$pid"; exit $?; }
        sleep .01
    done
    [[ -e "$ready" ]] || { echo "checkpoint timeout: $phase" >&2; exit 124; }
    cat "/proc/$pid/smaps_rollup" > "$RUN_OUT/$phase.smaps_rollup"
    cat "/proc/$pid/status" > "$RUN_OUT/$phase.status"
    if [[ ${RUN_FULL_SMAPS:-0} == 1 && $phase == prefill_done ]]; then
        cat "/proc/$pid/smaps" > "$RUN_OUT/$phase.smaps"
        cat "/proc/$pid/maps" > "$RUN_OUT/$phase.maps"
    fi
    {
        for f in memory.current memory.peak memory.swap.current memory.swap.peak memory.events memory.stat; do
            echo "$f"
            cat "/sys/fs/cgroup/$f"
        done
    } > "$RUN_OUT/$phase.cgroup"
    {
        for fd in /proc/$pid/fdinfo/*; do
            grep -H -E '^(drm-|pdev:|drm-driver:|drm-client-id:)' "$fd" || true
        done
    } > "$RUN_OUT/$phase.drm-fdinfo"
    touch "$RUN_OUT/checkpoints/$phase.continue"
done
set +e
wait "$pid"
rc=$?
set -e
printf '%s\n' "$rc" > "$RUN_OUT/run.exit"
{
    for f in memory.current memory.peak memory.swap.current memory.swap.peak memory.events memory.stat; do
        echo "$f"
        cat "/sys/fs/cgroup/$f"
    done
} > "$RUN_OUT/final.cgroup"
exit "$rc"
