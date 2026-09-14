#!/bin/bash
# SCRIPT_JDOC: {"summary":"Run admitted current-master CPU handoff/Q6 CTests and vocabulary-only prefix checks without GPU or trained tensor loading","kind":"mixed","weight":"standard","role":"entrypoint"}
set -euo pipefail
root=/var/home/agent/workspace/reports/xe-master-agentic-20260914
prior=/var/home/agent/workspace/reports/xe-hotspots-agentic-20260913
out="$root/build-cpu"
export LD_LIBRARY_PATH="$out/bin" GGML_BACKEND_PATH="$root/no-plugins"
ctest --test-dir "$out" -V -R '^test-(q6-pair|kv-handoff|context-handoff(-gemma)?)$'
for name in pilot exclusive followup; do
 case "$name" in
  pilot) input="$prior/agentic-runs/clamp-candidate-pilot/round-5.json";;
  exclusive) input="$prior/agentic-runs/clamp-candidate-exclusive/round-6.json";;
  followup) input="$prior/evidence/render-followup-input.json";;
 esac
 "$out/bin/agentic-session" /var/home/agent/workspace/projects/models/gemma-4-e4b-qat-mtp/gemma-4-E4B_q4_0-it.gguf "$input" --render-audit > "$root/evidence/render-$name.json" 2> "$root/evidence/render-$name.log"
done
for f in memory.peak memory.swap.peak memory.events cpu.stat; do printf '%s\n' "$f";cat "/sys/fs/cgroup/$f";done
