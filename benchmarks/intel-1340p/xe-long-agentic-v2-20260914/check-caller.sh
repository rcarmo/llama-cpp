#!/bin/bash
set -euo pipefail
root=/var/home/agent/workspace/reports/xe-long-agentic-v2-20260914
runtime=/var/home/agent/workspace/reports/xe-master-agentic-20260914
trap 'for f in memory.peak memory.swap.peak memory.events cpu.stat;do echo "$f";cat "/sys/fs/cgroup/$f";done' EXIT
bash "$root/build-native.sh"
export LD_LIBRARY_PATH="$runtime/build-cpu/bin" GGML_BACKEND_PATH="$root/no-gpu-plugins"
"$root/bin/agentic-session" --control-selftest
"$root/bin/agentic-session" /var/home/agent/workspace/projects/models/gemma-4-e4b-qat-mtp/gemma-4-E4B_q4_0-it.gguf /var/home/agent/workspace/reports/xe-hotspots-agentic-20260913/evidence/render-followup-input.json --render-audit > "$root/evidence/render-followup.json"
