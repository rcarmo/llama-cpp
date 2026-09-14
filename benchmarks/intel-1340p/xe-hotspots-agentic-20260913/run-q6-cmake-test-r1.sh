#!/bin/bash
set -euo pipefail
root=/var/home/agent/workspace/reports/xe-hotspots-agentic-20260913
name=xe-q6-cmake-test-r1
trap 'timeout -k 2 8 podman kill "$name" >/dev/null 2>&1 || true; timeout -k 2 8 podman rm -f --ignore "$name" >/dev/null 2>&1 || true' EXIT
timeout -k 3 45 podman run -i --name "$name" --network none --memory 512m --memory-swap 512m --pids-limit 96 --cpus 2 --userns keep-id --security-opt label=disable -v /var/home/agent/workspace:/var/home/agent/workspace localhost/llama-intel-build:fedora44 bash -s -- "$root" <<'SH' > "$root/evidence/q6-cmake-test-r1.log" 2>&1
set -euo pipefail
root=$1
cat /sys/fs/cgroup/cpu.stat > "$root/evidence/q6-cmake-test-r1-cpu-before.txt"
ctest --test-dir "$root/q6-cmake-build" -V -R '^test-q6-pair$' & pid=$!
while kill -0 "$pid" 2>/dev/null; do
 printf 'SAMPLE memory='; cat /sys/fs/cgroup/memory.current
 printf ' swap='; cat /sys/fs/cgroup/memory.swap.current
 test "$(cat /sys/fs/cgroup/memory.swap.current)" = 0 || { kill "$pid"; exit 1; }
 sleep .05
done
wait "$pid"
for f in memory.peak memory.swap.peak memory.events cpu.stat cpu.max; do echo "CGROUP $f"; cat "/sys/fs/cgroup/$f"; done
SH
podman inspect "$name" > "$root/evidence/q6-cmake-test-r1-container.json"
cat "$root/evidence/q6-cmake-test-r1.log"
