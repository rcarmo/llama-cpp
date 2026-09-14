/** SCRIPT_JDOC:
{"summary":"Prepare frozen baseline versus allocation-batched promoted-Q6 combined trained comparison with unchanged default Vulkan","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root=import.meta.dir, base='/var/home/agent/workspace/reports/xe-in-memory-perf-20260913';
let source=readFileSync(root+'/agentic-runner-promoted-q6.ts','utf8');
for(const [a,b] of [
 ["['q6off','q6on']","['baseline','combined']"],
 ["libs=root+'/q6-portable-build/native/bin:'+root+'/build-cpu/bin:'+base+'/release/bin'","libs=arm==='baseline'?base+'/release/bin':root+'/q6-portable-build/native/bin:'+root+'/build-cpu/bin:'+base+'/release/bin'"],
 ["GGML_CPU_Q6_PAIR:arm==='q6off'?'0':'1'","GGML_CPU_Q6_PAIR:arm==='baseline'?'0':'1'"],
 ["library_hash:hash(root+'/build-cpu/bin/libllama.so.0'),cpu_library_hash:hash(root+'/q6-portable-build/native/bin/libggml-cpu.so.0')","library_hash:hash((arm==='baseline'?base+'/release/bin':root+'/build-cpu/bin')+'/libllama.so.0'),cpu_library_hash:hash((arm==='baseline'?base+'/release/bin':root+'/q6-portable-build/native/bin')+'/libggml-cpu.so.0')"],
 ["if(!maps.includes(root+'/q6-portable-build/native/bin/libggml-cpu.so.0.23.0'))","if(!maps.includes((arm==='baseline'?base+'/release/bin':root+'/q6-portable-build/native/bin')+'/libggml-cpu.so.0.23.0'))"],
 ['agentic-runner-promoted-q6.ts','agentic-runner-combined.ts'], ['launch-agentic-promoted-q6.sh','launch-agentic-combined.sh'],
]) {if(!source.includes(a))throw Error('Missing anchor '+a);source=source.replaceAll(a,b);}
writeFileSync(root+'/agentic-runner-combined.ts',source);
writeFileSync(root+'/launch-agentic-combined.sh',readFileSync(root+'/launch-agentic-promoted-q6.sh','utf8').replaceAll('agentic-runner-promoted-q6.ts','agentic-runner-combined.ts'));
const sha=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const runs=[['combined-clamp-b0','baseline'],['combined-clamp-c0','combined'],['combined-clamp-c1','combined'],['combined-clamp-b1','baseline']].map(([id,arm])=>({id,arm,kind:'clamp',series:'write-v2'}));
writeFileSync(root+'/combined-freeze.json',JSON.stringify({at:new Date().toISOString(),runs,hashes:Object.fromEntries(['agentic-session.cpp','agentic-runner-combined.ts','agentic-tools.ts','agentic-outcome.ts','tool-response.ts','launch-agentic-combined.sh','agentic-stop.sh'].map(f=>[f,sha(root+'/'+f)])),libraries:{baseline:{llama:sha(base+'/release/bin/libllama.so.0'),cpu:sha(base+'/release/bin/libggml-cpu.so.0')},combined:{llama:sha(root+'/build-cpu/bin/libllama.so.0'),cpu:sha(root+'/q6-portable-build/native/bin/libggml-cpu.so.0')}},binary:sha(root+'/build-cpu/bin/agentic-session'),vulkan:sha(base+'/vulkan/libggml-vulkan.so.0.23.0')},null,2)+'\n');
console.log('Prepared and frozen 4-run combined clamp ABBA; no model execution. Baseline pre-batching/Q6off vs batching+promotedQ6on; same default Vulkan.');
