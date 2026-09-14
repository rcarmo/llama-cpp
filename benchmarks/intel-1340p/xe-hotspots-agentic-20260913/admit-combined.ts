/** SCRIPT_JDOC:
{"summary":"Verify frozen combined artifacts and write a short-lived exact-run admission after explicit peer approval","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { strict as assert } from 'node:assert';
const root=import.meta.dir,id=process.argv[2],confirmation=process.argv[3];
assert.equal(confirmation,'explicit-three-way-admit');
const freeze=JSON.parse(readFileSync(root+'/combined-freeze.json','utf8')),run=freeze.runs.find(x=>x.id===id);
assert.ok(run,'Unknown frozen run');assert.equal(existsSync(root+'/agentic-runs/'+id),false,'Retained run must not be replaced');
const hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
for(const[f,h]of Object.entries(freeze.hashes))assert.equal(hash(root+'/'+f),h,f);
const base='/var/home/agent/workspace/reports/xe-in-memory-perf-20260913';
assert.equal(hash(root+'/build-cpu/bin/agentic-session'),freeze.binary);
assert.equal(hash(base+'/vulkan/libggml-vulkan.so.0.23.0'),freeze.vulkan);
assert.equal(hash((run.arm==='baseline'?base+'/release/bin':root+'/build-cpu/bin')+'/libllama.so.0'),freeze.libraries[run.arm].llama);
assert.equal(hash((run.arm==='baseline'?base+'/release/bin':root+'/q6-portable-build/native/bin')+'/libggml-cpu.so.0'),freeze.libraries[run.arm].cpu);
writeFileSync(root+'/agentic-admission.json',JSON.stringify({run_id:id,arm:run.arm,series:run.series,expires:new Date(Date.now()+660000).toISOString(),scope:'Explicit three-way ADMIT; one frozen run;600s16GiB16MiBswap6GiBreserve'},null,2)+'\n');
console.log('Frozen sources,caller,Vulkan and arm libraries verified; admission recorded for '+id);
