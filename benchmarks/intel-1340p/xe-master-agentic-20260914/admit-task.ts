/** SCRIPT_JDOC:
{"summary":"Verify frozen current-runtime artifacts and record one exact task-matrix admission after explicit peer approval","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { strict as assert } from 'node:assert';
const root=import.meta.dir,id=process.argv[2];assert.equal(process.argv[3],'explicit-three-way-admit');
const runs=[['master-median-on0','median','q6on'],['master-median-off0','median','q6off'],['master-defaults-off0','defaults','q6off'],['master-defaults-on0','defaults','q6on']];
const run=runs.find(x=>x[0]===id);assert.ok(run);assert.equal(existsSync(root+'/agentic-runs/'+id),false);
const f=JSON.parse(readFileSync(root+'/agentic-freeze.json','utf8')),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
for(const [name,h]of Object.entries(f.hashes))assert.equal(hash(root+'/'+name),h,name);
for(const [name,h]of Object.entries(f.libraries))assert.equal(hash(root+'/build-cpu/bin/'+name),h,name);
assert.equal(hash(root+'/build-vulkan-parent/bin/libggml-vulkan.so'),f.vulkan);
writeFileSync(root+'/agentic-admission.json',JSON.stringify({run_id:id,arm:run[2],kind:run[1],series:'write-v2',expires:new Date(Date.now()+660000).toISOString(),scope:'Fresh exact three-way admitted current-mastertask;600s16GiBzeroSwap6GiBreserve'},null,2)+'\n');
console.log(`Frozen identity verified; ${id} ${run[1]} ${run[2]} write-v2 admission recorded`);
