#!/bin/bash
set -euo pipefail
root=/var/home/agent/workspace/reports/xe-hotspots-agentic-20260913
workspace=$(cd "$root/../.." && pwd)
dir="$root/q6-mismatch-diagnostic"
[ ! -e "$dir" ] || { echo 'Retained diagnostic exists'; exit 1; }
mkdir "$dir"
name=xe-q6-mismatch-diagnostic
trap 'podman rm -f --ignore "$name" >/dev/null 2>&1 || true' EXIT
sha256sum "$root/q6-build/pair.o" "$root/q6-pair.cpp" "$root/q6-native.cpp" > "$dir/before.sha256"
set +e
timeout -k 3 30 podman run --rm --name "$name" --network none --memory 256m --memory-swap 256m --pids-limit 48 --cpus 1 --userns keep-id --security-opt label=disable -v "$workspace:$workspace" localhost/llama-intel-build:fedora44 bash -c "set -e; bash '$root/build-q6-diagnostic.sh'; cd '$dir'; export LD_LIBRARY_PATH='$workspace/reports/xe-in-memory-perf-20260913/release/bin'; Q6_DIAGNOSTIC_ONLY=1 '$root/q6-build/test-q6-diagnostic'" > "$dir/diagnostic.log" 2>&1
rc=$?
set -e
printf '%s\n' "$rc" > "$dir/exit-code.txt"
cat "$dir/diagnostic.log"
[ "$rc" -eq 3 ]
sha256sum -c "$dir/before.sha256"
(cd "$dir"; sha256sum q6-mismatch-x.bin q6-mismatch-y.bin > input.sha256)
