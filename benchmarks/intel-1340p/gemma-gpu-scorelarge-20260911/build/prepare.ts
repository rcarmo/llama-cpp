/** SCRIPT_JDOC:
{"summary":"Build isolated Intel attention split-K host dispatch with retained fixed shaders","kind":"mutating","weight":"heavy","role":"entrypoint"}
*/
import{readFileSync,writeFileSync,copyFileSync,mkdirSync,readdirSync,statSync}from'node:fs';
const root='/var/home/agent/workspace/reports/gemma-gpu-scorelarge-20260911',build='/var/home/agent/workspace/reports/gemma-simd-async-20260906/build-vulkan',fix='/var/home/agent/workspace/reports/gemma-kv-quality-20260910/softmax-fix';
const cc=JSON.parse(readFileSync(build+'/compile_commands.json','utf8')).find(x=>x.file.endsWith('/ggml-vulkan.cpp'));
let compile=cc.command.replace('/usr/lib64/ccache/clang++','/usr/sbin/clang++').replace(' -o ggml/src/ggml-vulkan/CMakeFiles/ggml-vulkan.dir/ggml-vulkan.cpp.o ',' -o '+root+'/build/ggml-vulkan.o ').replace(' -c '+cc.file,' -c '+root+'/patch/ggml-vulkan.cpp');
compile=compile.replace(' -I',' -I/var/home/agent/workspace/projects/llama-cpp/ggml/src/ggml-vulkan -I');
let link=readFileSync(fix+'/build.sh','utf8').split('\n').find(l=>l.startsWith(': && '))!;if(!link)throw Error('Missing retained Vulkan link');
link=link.replaceAll('/usr/lib64/ccache/clang++','/usr/sbin/clang++').replace(' -o '+fix+'/bin/libggml-vulkan.so.0.23.0 ',' -o '+root+'/build/libggml-vulkan.so.0.23.0 ').replace(' ggml/src/ggml-vulkan/CMakeFiles/ggml-vulkan.dir/ggml-vulkan.cpp.o ',' '+root+'/build/ggml-vulkan.o ').replace('--dependency-file=ggml/src/ggml-vulkan/CMakeFiles/ggml-vulkan.dir/link.d','--dependency-file='+root+'/build/link.d');
writeFileSync(root+'/build/commands.sh','#!/usr/bin/env bash\nset -euo pipefail\ncd '+build+'\n'+compile+'\n'+link+'\n');const p=Bun.spawn(['/bin/bash',root+'/build/commands.sh'],{stdout:'inherit',stderr:'inherit'});if(await p.exited)throw Error('Split-K build');
for(const sub of ['bin','runtime']){mkdirSync(root+'/runtime-gpu/'+sub,{recursive:true});for(const n of readdirSync('/var/home/agent/workspace/reports/gemma-prefill-crossover-20260911/runtime-gpu/'+sub))if(statSync('/var/home/agent/workspace/reports/gemma-prefill-crossover-20260911/runtime-gpu/'+sub+'/'+n).isFile())copyFileSync('/var/home/agent/workspace/reports/gemma-prefill-crossover-20260911/runtime-gpu/'+sub+'/'+n,root+'/runtime-gpu/'+sub+'/'+n)}
for(const n of ['libggml-vulkan.so','libggml-vulkan.so.0','libggml-vulkan.so.0.23.0'])copyFileSync(root+'/build/libggml-vulkan.so.0.23.0',root+'/runtime-gpu/bin/'+n);
console.log('Isolated split-K runtime ready; fixed softmax shaders and bounded export retained');
