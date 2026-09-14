#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Verify hybrid rollout evidence and adapter tests without model inference or live endpoints","kind":"read-only","weight":"lightweight","role":"entrypoint"}
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
repo=$(git -C "$here" rev-parse --show-toplevel)
(cd "$here"; sha256sum -c checksums.sha256 >/dev/null)
bun test "$repo/tools/gemma-hybrid"
bun - "$here" <<'TS'
const root=process.argv[2],read=async(n:string)=>Bun.file(root+'/'+n).json();
const live=await read('production-smoke-final.json'),recovery=await read('recovery-results.json'),api=await read('attempt4-results.json'),stream=await read('native-completion-stream-final.json');
if(!live.pass||live.cpu_swap_kib!==0||live.status.counters.gpu!==1||live.status.counters.warm!==3||live.status.counters.errors!==0||live.slots.length!==2)throw Error('Productionacceptance');
if(!recovery.pass||!recovery.rows.some(r=>r.label==='native-gpu-kill-fallback'&&r.route==='cpu-fallback')||!recovery.rows.some(r=>r.label==='native-cpu-generation-restart'&&r.before.pid!==r.after.pid))throw Error('Native recovery');
if(api.pass!==false||!api.rows.some(r=>r.label==='cold-sse'&&r.route==='gpu-cold')||!api.rows.some(r=>r.label==='queued-and-decode-cancel'&&r.pass))throw Error('Retainedstageevidence');
if(stream.status!==200||!stream.raw.includes('"stop":true')||stream.adapter.active)throw Error('NativeSSE');
console.log('PASS production SSE/tools/cache/identity, actual native recovery, preserved partial-stage failure and native completion stream');
TS
printf 'PASS recorded offline evidence only; no live inference\n'
