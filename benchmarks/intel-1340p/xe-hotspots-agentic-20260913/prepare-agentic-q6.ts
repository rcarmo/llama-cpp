/** SCRIPT_JDOC:
{"summary":"Generate isolated Q6 off/on/trace agentic runner from the frozen write-v2 harness","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import{readFileSync,writeFileSync}from'node:fs';const root=import.meta.dir;
let s=readFileSync(root+'/agentic-runner.ts','utf8');
function replace(a:string,b:string){if(s.split(a).length!==2)throw Error('Ambiguous source '+a);s=s.replace(a,b);}
replace("!['baseline','candidate','cpu'].includes(arm)","!['q6off','q6on','q6trace'].includes(arm)");
replace("libs=arm==='baseline'?base+'/release/bin':root+'/build-cpu/bin:'+base+'/release/bin'","libs=root+'/q6-dispatch-build/bin:'+root+'/build-cpu/bin:'+base+'/release/bin'");
replace("GGML_BACKEND_PATH:base+'/vulkan/libggml-vulkan.so.0.23.0'","GGML_BACKEND_PATH:base+'/vulkan/libggml-vulkan.so.0.23.0',GGML_XE_Q6_PAIR:arm==='q6off'?'0':'1',GGML_XE_Q6_TRACE:arm==='q6trace'?'1':'0'");
replace("library_hash:hash((arm==='baseline'?base+'/release/bin':root+'/build-cpu/bin')+'/libllama.so.0')","library_hash:hash(root+'/build-cpu/bin/libllama.so.0'),cpu_library_hash:hash(root+'/q6-dispatch-build/bin/libggml-cpu.so.0')");
replace("'agentic-runner.ts'","'agentic-runner-q6.ts'");
replace("'launch-agentic.sh'","'launch-agentic-q6.sh'");
replace("validAdmission(admission,id);","validAdmission(admission,id);if(admission.arm!==arm)throw Error('Q6 arm admission mismatch');");
replace(" const finalServices=await serviceState();"," const maps=text(dir+'/maps.txt');if(!maps.includes(root+'/q6-dispatch-build/bin/libggml-cpu.so.0.23.0'))abort=abort||'Q6 CPU library mapping missing';\n const finalServices=await serviceState();");
writeFileSync(root+'/agentic-runner-q6.ts',s);
let sh=readFileSync(root+'/launch-agentic.sh','utf8').replaceAll('agentic-runner.ts','agentic-runner-q6.ts');writeFileSync(root+'/launch-agentic-q6.sh',sh);
console.log('Generated isolated Q6 agentic harness, same tasks/limits/native binary, only Q6 mode differs');
