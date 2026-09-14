#!/bin/bash
set -euo pipefail
root=/var/home/agent/workspace/reports/xe-long-agentic-20260914
runtime=/var/home/agent/workspace/reports/xe-master-agentic-20260914
name=xe-long-agentic-harness
[[ ${1:-} == explicit-three-way-admit ]] || exit 2
[[ ! -e "$root/evidence/harness-check.log" ]] || { echo 'Retained attempt exists';exit 2; }
export XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus
cleanup(){ podman kill --signal KILL "$name" >/dev/null 2>&1 || true;podman rm -f "$name" >/dev/null 2>&1 || true;bash "$root/stop.sh" "$root/evidence/harness-containers.txt"; }
trap cleanup EXIT
# Native compilation/selftest/vocabulary stay in one no-device, no-network capped container.
timeout --kill-after=3 90 podman run --rm --name "$name" --network=none --cpus=2 --memory=1g --memory-swap=1g --pids-limit=128 --security-opt label=disable -v /var/home/agent/workspace:/var/home/agent/workspace:rw --workdir /var/home/agent/workspace localhost/llama-intel-build:fedora44 bash -c '
set -euo pipefail
root=/var/home/agent/workspace/reports/xe-long-agentic-20260914
runtime=/var/home/agent/workspace/reports/xe-master-agentic-20260914
trap '\''for f in memory.peak memory.swap.peak memory.events cpu.stat;do echo "$f";cat "/sys/fs/cgroup/$f";done'\'' EXIT
bash "$root/build-native.sh"
export LD_LIBRARY_PATH="$runtime/build-cpu/bin" GGML_BACKEND_PATH="$root/no-gpu-plugins"
"$root/bin/agentic-session" --control-selftest
"$root/bin/agentic-session" /var/home/agent/workspace/projects/models/gemma-4-e4b-qat-mtp/gemma-4-E4B_q4_0-it.gguf /var/home/agent/workspace/reports/xe-hotspots-agentic-20260913/evidence/render-followup-input.json --render-audit > "$root/evidence/render-followup.json"
' > "$root/evidence/harness-check.log" 2>&1
bun "$root/verify-harness.ts" > "$root/evidence/fixture-check.log" 2>&1
bun -e 'const r=await Bun.file(process.argv[1]).json();if(!r.passed||r.append_mutations_rejected!==4)throw Error("Prefix check");console.log("PASS",r.rows.length,"prefixes");' "$root/evidence/render-followup.json"
cat "$root/evidence/harness-check.log" | tail -24
cat "$root/evidence/fixture-check.log"
