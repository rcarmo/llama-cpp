#!/bin/bash
# SCRIPT_JDOC: {"summary":"Build the report-only agentic caller and run vocabulary-only regressions in a bounded CPU container","kind":"mixed","weight":"standard","role":"entrypoint"}
set -euo pipefail
root=$(cd -- "$(dirname -- "$0")" && pwd)
workspace=$(cd "$root/../.." && pwd)
base="$workspace/reports/xe-in-memory-perf-20260913/release"
name=xe-agentic-render-fixed
trap 'podman rm -f --ignore "$name" >/dev/null 2>&1 || true' EXIT
# Caller must obtain a fresh <=60s/1CPU/768MiB window before invoking.
bun - "$root" <<'TS'
import{readFileSync,writeFileSync}from'node:fs';
const root=process.argv[2];
const trace=JSON.parse(readFileSync(root+'/agentic-runs/clamp-candidate-exclusive/round-6.json','utf8'));
trace.messages.push({role:'assistant',content:'Stopped after the reported test failure.'},{role:'user',content:'Also reject NaN inputs with RangeError. Read the current file before changing it.'});
writeFileSync(root+'/evidence/render-followup-input.json',JSON.stringify(trace,null,2)+'\n');
TS
timeout -k 3 60 podman run -i --rm --name "$name" --network none --memory 768m --memory-swap 768m --pids-limit 96 --cpus 1 --userns keep-id --security-opt label=disable -v "$workspace:$workspace" localhost/llama-intel-build:fedora44 bash -s -- "$root" "$base" "$workspace" <<'SH' > "$root/evidence/render-fixed-build.log" 2>&1
set -euo pipefail
root=$1; base=$2; workspace=$3
bash "$root/compile-agents.sh"
export LD_LIBRARY_PATH="$root/build-cpu/bin:$base/bin"
for name in pilot exclusive followup; do
 case "$name" in
 pilot) input="$root/agentic-runs/clamp-candidate-pilot/round-5.json";;
 exclusive) input="$root/agentic-runs/clamp-candidate-exclusive/round-6.json";;
 followup) input="$root/evidence/render-followup-input.json";;
 esac
 "$root/build-cpu/bin/agentic-session" "$workspace/projects/models/gemma-4-e4b-qat-mtp/gemma-4-E4B_q4_0-it.gguf" "$input" --render-audit > "$root/evidence/render-$name-fixed.json" 2> "$root/evidence/render-$name-fixed.log"
done
sha256sum "$root/agentic-session.cpp" "$root/build-cpu/bin/agentic-session" > "$root/evidence/render-fixed-identity.sha256"
SH
bun "$root/verify-render.ts" | tee "$root/evidence/render-fixed-verification.log"
bun test "$root/agentic-tools.test.ts" > "$root/evidence/tools-render-fixed.log" 2>&1
cat "$root/evidence/tools-render-fixed.log"
