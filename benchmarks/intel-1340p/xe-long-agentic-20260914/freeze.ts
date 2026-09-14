/** SCRIPT_JDOC:
{"summary":"Freeze long-task sources/fixture/model/runtime hashes before any trained three-arm run","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import{readFileSync,writeFileSync,readdirSync,statSync,existsSync}from'node:fs';import{createHash}from'node:crypto';import{strict as assert}from'node:assert';
const root=import.meta.dir,runtime=root+'/../xe-master-agentic-20260914';assert.equal(existsSync(root+'/freeze.json'),false,'Existing freeze');
function walk(p:string):string[]{return readdirSync(p).sort().flatMap(f=>statSync(p+'/'+f).isDirectory()?walk(p+'/'+f):[p+'/'+f]);}
const paths=['agentic-session.cpp','runner.ts','tools.ts','container-tests.ts','stop.sh','launch.sh','bin/agentic-session'].map(f=>root+'/'+f).concat(walk(root+'/fixtures'),['libllama.so.0','libllama-common.so.0','libggml-cpu.so.0','libggml-base.so.0'].map(f=>runtime+'/build-cpu/bin/'+f),runtime+'/build-vulkan-parent/bin/libggml-vulkan.so');
const files=Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
// Model hashes are the already verified pinned assets; record stat identities to detect replacement.
const models=['/var/home/agent/workspace/projects/models/gemma-4-e4b-qat-mtp/gemma-4-E4B_q4_0-it.gguf','/var/home/agent/workspace/projects/models/gemma-4-e4b-qat-mtp/gemma-4-E4B-it-qat-assistant-MTP-Q8_0.gguf'].map(path=>{const s=statSync(path);return{path,size:s.size,mtime_ms:s.mtimeMs,ino:s.ino};});
writeFileSync(root+'/freeze.json',JSON.stringify({at:new Date().toISOString(),files,models,order:['long-cpu-0','long-copy-0','long-share-0','long-share-1','long-copy-1','long-cpu-1'],limits:{turns:48,per_turn:1024,total_output:12288,context:32768,seconds:1200,memory:17179869184,swap:0},scope:'Same fixed runtime/Q6ON/MTP3;onlyCPUvsGPUprefill/copy/shared routing differs'},null,2)+'\n');
console.log('Frozen sources,fixture,runtime and model identities;no model inference');
