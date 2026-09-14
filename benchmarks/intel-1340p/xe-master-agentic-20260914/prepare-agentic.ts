/** SCRIPT_JDOC:
{"summary":"Prepare separate current-master trained runner with retained fixture contracts and strict new-runtime identities; no inference","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { strict as assert } from 'node:assert';
const root=import.meta.dir,old=root+'/../xe-hotspots-agentic-20260913';
assert.equal(existsSync(root+'/agentic-runner.ts'),false,'Retained runner exists');
const copied=['agentic-tools.ts','agentic-tools.test.ts','agentic-outcome.ts','agentic-outcome.test.ts','tool-response.ts','tool-response.test.ts','agentic-stop.sh','verify-agentic-run.ts'];
for(const f of copied)copyFileSync(old+'/'+f,root+'/'+f);
let source=readFileSync(old+'/agentic-runner-promoted-q6.ts','utf8');
for(const [a,b] of [
 ["libs=root+'/q6-portable-build/native/bin:'+root+'/build-cpu/bin:'+base+'/release/bin'","libs=root+'/build-cpu/bin'"],
 ["GGML_BACKEND_PATH:base+'/vulkan/libggml-vulkan.so.0.23.0'","GGML_BACKEND_PATH:root+'/build-vulkan-parent/bin/libggml-vulkan.so'"],
 ["hash(root+'/q6-portable-build/native/bin/libggml-cpu.so.0')","hash(root+'/build-cpu/bin/libggml-cpu.so.0'),common_library_hash:hash(root+'/build-cpu/bin/libllama-common.so.0'),base_library_hash:hash(root+'/build-cpu/bin/libggml-base.so.0'),vulkan_library_hash:hash(root+'/build-vulkan-parent/bin/libggml-vulkan.so')"],
 ["root+'/q6-portable-build/native/bin/libggml-cpu.so.0.23.0'","root+'/build-cpu/bin/libggml-cpu.so.0.23.0'"],
 ["'agentic-runner-promoted-q6.ts'","'agentic-runner.ts'"], ["'launch-agentic-promoted-q6.sh'","'launch-agentic.sh'"],
]){assert.ok(source.includes(a),a);source=source.replaceAll(a,b);}
const guard=" const finalServices=await serviceState();";
assert.equal(source.split(guard).length,2);
source=source.replace(guard,()=>` for(const suffix of ['/build-cpu/bin/libllama.so.0.4.0','/build-cpu/bin/libllama-common.so.0.4.0','/build-cpu/bin/libggml-base.so.0.23.0'])if(!maps.includes(root+suffix))abort=abort||'Fresh runtime mapping missing '+suffix;
 if(!text(dir+'/gpu-maps.txt').includes(env.GGML_BACKEND_PATH))abort=abort||'Fresh Vulkan mapping missing';
 const cgroup=text('/proc/self/cgroup').trim().split('::')[1],cg='/sys/fs/cgroup'+cgroup;
 const resource=Object.fromEntries(['memory.max','memory.swap.max','memory.peak','memory.swap.peak','memory.events','cpu.stat'].map(f=>[f,text(cg+'/'+f)]));save('cgroup-final.json',resource);
 if(!/^0\\s*$/.test(resource['memory.swap.max'])||!/^0\\s*$/.test(resource['memory.swap.peak']))abort=abort||'Cgroup swap evidence';
 for(const key of ['max','oom','oom_kill']){const value=resource['memory.events'].match(new RegExp('^'+key+' (\\\\d+)$','m'))?.[1];if(value===undefined||Number(value)!==0)abort=abort||'Cgroup memory event '+key;}
`+guard);
const mapsNeedle="if(maps.includes('libllama.so'))writeFileSync(dir+'/maps.txt',maps);";assert.ok(source.includes(mapsNeedle));
source=source.replace(mapsNeedle,mapsNeedle+"if(maps.includes(env.GGML_BACKEND_PATH))writeFileSync(dir+'/gpu-maps.txt',maps);");
writeFileSync(root+'/agentic-runner.ts',source);
let launch=readFileSync(old+'/launch-agentic-promoted-q6.sh','utf8');
launch=launch.replaceAll('/xe-hotspots-agentic-20260913','/xe-master-agentic-20260914').replaceAll('agentic-runner-promoted-q6.ts','agentic-runner.ts').replaceAll('MemorySwapMax=16M','MemorySwapMax=0');
writeFileSync(root+'/launch-agentic.sh',launch);
const hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
writeFileSync(root+'/agentic-freeze.json',JSON.stringify({at:new Date().toISOString(),runtime_source_commit:'1327069285c82ca298c53853023443fd01a6d1fe',hashes:Object.fromEntries(['agentic-session.cpp','agentic-runner.ts','launch-agentic.sh',...copied.filter(f=>!f.endsWith('.test.ts'))].map(f=>[f,hash(root+'/'+f)])),libraries:Object.fromEntries(['agentic-session','libllama.so.0','libllama-common.so.0','libggml-cpu.so.0','libggml-base.so.0'].map(f=>[f,hash(root+'/build-cpu/bin/'+f)])),vulkan:hash(root+'/build-vulkan-parent/bin/libggml-vulkan.so'),pilot:{id:'master-clamp-on-pilot',kind:'clamp',arm:'q6on',series:'write-v2'},notes:'Current runtime, original fixtures; zero-swap cgroup, historical timings separate.'},null,2)+'\n');
console.log('Separate current-master runner and fixture contracts prepared/frozen; no inference.');
