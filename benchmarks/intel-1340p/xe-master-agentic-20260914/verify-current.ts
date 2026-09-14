/** SCRIPT_JDOC:
{"summary":"Verify retained current-runtime task grades, state, frozen binary maps and strict cgroup evidence without inference","kind":"read-only","weight":"lightweight","role":"entrypoint"}
*/
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { verifyRun } from './verify-agentic-run';
export function verifyCurrent(id:string,root=import.meta.dir){
 const f=JSON.parse(readFileSync(root+'/agentic-freeze.json','utf8')),dir=root+'/agentic-runs/'+id;
 const r=verifyRun(id,root),m=JSON.parse(readFileSync(dir+'/manifest.json','utf8')),cg=JSON.parse(readFileSync(dir+'/cgroup-final.json','utf8'));
 for(const [field,file]of [['binary_hash','agentic-session'],['library_hash','libllama.so.0'],['cpu_library_hash','libggml-cpu.so.0'],['common_library_hash','libllama-common.so.0'],['base_library_hash','libggml-base.so.0']])assert.equal(m[field],f.libraries[file]);
 assert.equal(m.vulkan_library_hash,f.vulkan);assert.equal(m.source_hash,f.hashes['agentic-session.cpp']);
 for(const [file,hash]of Object.entries(m.harness_hashes))assert.equal(hash,f.hashes[file],file);
 assert.equal(cg['memory.max'].trim(),'17179869184');assert.equal(cg['memory.swap.max'].trim(),'0');assert.equal(cg['memory.swap.peak'].trim(),'0');
 assert.ok(Number(cg['memory.peak'])>0&&Number(cg['memory.peak'])<=17179869184);
 for(const key of ['max','oom','oom_kill'])assert.equal(cg['memory.events'].match(new RegExp('^'+key+' (\\d+)$','m'))?.[1],'0',key);
 const maps=readFileSync(dir+'/maps.txt','utf8'),gpu=readFileSync(dir+'/gpu-maps.txt','utf8');
 for(const file of ['libllama.so.0.4.0','libllama-common.so.0.4.0','libggml-cpu.so.0.23.0','libggml-base.so.0.23.0'])assert.ok(maps.includes('/xe-master-agentic-20260914/build-cpu/bin/'+file));
 assert.ok(gpu.includes('/xe-master-agentic-20260914/build-vulkan-parent/bin/libggml-vulkan.so'));
 assert.equal(m.env.GGML_CPU_Q6_PAIR,r.arm==='q6on'?'1':'0');
 console.log('PASS current-runtime identities/maps/cgroup for '+id);return r;
}
if(import.meta.main)verifyCurrent(process.argv[2]);
