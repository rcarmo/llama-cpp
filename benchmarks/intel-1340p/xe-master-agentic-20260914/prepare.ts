/** SCRIPT_JDOC:
{"summary":"Prepare a separate merged-master agentic caller and compile-only recipe while preserving completed benchmark source identities","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root=import.meta.dir,workspace='/var/home/agent/workspace',repo=workspace+'/projects/llama-cpp';
const previous=workspace+'/reports/xe-hotspots-agentic-20260913/agentic-session.cpp';
if(existsSync(root+'/source-preparation.json'))throw Error('Preparation already retained; do not overwrite');
let s=readFileSync(previous,'utf8');
if(s.split('dp.n_past=past').length!==2)throw Error('Unexpected prior caller');
s=s.replace('dp.n_past=past','dp.pos0=past');
s=s.replace('#include "../../projects/llama-cpp/vendor/nlohmann/json.hpp"','#include "nlohmann/json.hpp"');
writeFileSync(root+'/agentic-session.cpp',s);mkdirSync(root+'/evidence',{recursive:true});
const hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
writeFileSync(root+'/source-preparation.json',JSON.stringify({at:new Date().toISOString(),base_commit:'d2c9ee8388f80d7423a1e0ee764017936d623b4c',prior_caller_sha256:hash(previous),new_caller_sha256:hash(root+'/agentic-session.cpp'),live_in_memory_sha256:hash(repo+'/tools/gemma-hybrid/in-memory.cpp'),speculative_header_sha256:hash(repo+'/common/speculative.h'),changes:['n_past→pos0: next absolute text-token position remains evaluated history length','nlohmann include through explicit vendor include path'],compiled:false},null,2)+'\n');
console.log('Prepared separate current-master caller; old benchmark bytes unchanged. Not compiled.');
