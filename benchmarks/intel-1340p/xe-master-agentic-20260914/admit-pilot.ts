/** SCRIPT_JDOC:
{"summary":"Verify frozen current-master pilot identities and record one short-lived admission only after explicit three-way approval","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { strict as assert } from 'node:assert';
const root=import.meta.dir;
assert.equal(process.argv[2],'explicit-three-way-admit');
const f=JSON.parse(readFileSync(root+'/agentic-freeze.json','utf8')),p=f.pilot;
assert.equal(p.id,'master-clamp-on-pilot');assert.equal(existsSync(root+'/agentic-runs/'+p.id),false);
const hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
for(const [name,h]of Object.entries(f.hashes))assert.equal(hash(root+'/'+name),h,name);
for(const [name,h]of Object.entries(f.libraries))assert.equal(hash(root+'/build-cpu/bin/'+name),h,name);
assert.equal(hash(root+'/build-vulkan-parent/bin/libggml-vulkan.so'),f.vulkan);
writeFileSync(root+'/agentic-admission.json',JSON.stringify({run_id:p.id,arm:p.arm,series:p.series,expires:new Date(Date.now()+660000).toISOString(),scope:'Fresh exact three-way admitted current-masterpilot;600s16GiBzeroSwap6GiBreserve'},null,2)+'\n');
console.log('Frozen source/runtime/plugin identities verified;pilotadmission recorded');
