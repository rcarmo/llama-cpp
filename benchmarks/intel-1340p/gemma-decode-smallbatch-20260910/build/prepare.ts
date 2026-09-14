/** SCRIPT_JDOC:
{"summary":"Compile only pinnedCPUllama-context with opt-in smallGemmatargetbatchdispatch, relink isolatedruntime","kind":"mutating","weight":"heavy","role":"entrypoint"}
*/
import{readFileSync,writeFileSync,mkdirSync,readdirSync,copyFileSync,statSync}from'node:fs';
const root='/var/home/agent/workspace/reports/gemma-decode-smallbatch-20260910',repo='/var/home/agent/workspace/projects/llama-cpp',build=repo+'/build-intel-clang';
const entry=JSON.parse(readFileSync(build+'/compile_commands.json','utf8')).find(x=>x.file.endsWith('/llama-context.cpp'));if(!entry)throw Error('Missingcompilerule');
let cc=entry.command.replaceAll('/usr/lib64/ccache/clang++','/usr/sbin/clang++').replace(' -o src/CMakeFiles/llama.dir/llama-context.cpp.o ',' -o '+root+'/build/llama-context.o ').replace(' -c '+entry.file,' -c '+root+'/patch/llama-context.cpp');
for(const sub of ['src','include','ggml/include'])cc=cc.replaceAll('-I'+repo+'/'+sub,'-I'+root+'/build/source/'+sub);
const p=Bun.spawn(['/usr/sbin/ninja-build','-C',build,'-t','commands','bin/libllama.so.0.0.10579'],{stdout:'pipe',stderr:'pipe'});const text=await new Response(p.stdout).text();if(await p.exited)throw Error(await new Response(p.stderr).text());let link=text.trim().split('\n').findLast(l=>l.includes('-o bin/libllama.so.0.0.10579 '));if(!link)throw Error('Missinglink');
link=link.replaceAll('/usr/lib64/ccache/clang++','/usr/sbin/clang++').replace(' -o bin/libllama.so.0.0.10579 ',' -o '+root+'/build/libllama.so.0.0.10579 ').replace(' src/CMakeFiles/llama.dir/llama-context.cpp.o ',' '+root+'/build/llama-context.o ').replace('--dependency-file=src/CMakeFiles/llama.dir/link.d','--dependency-file='+root+'/build/link.d');
writeFileSync(root+'/build/commands.sh','#!/usr/bin/env bash\nset -euo pipefail\ncd '+build+'\n'+cc+'\n'+link+'\n');const c=Bun.spawn(['/bin/bash',root+'/build/commands.sh'],{stdout:'inherit',stderr:'inherit'});if(await c.exited)throw Error('Isolatedbuild');
const original='/var/home/agent/workspace/reports/gemma-simd-async-20260906/baseline',dest=root+'/runtime-cpu';for(const sub of ['bin','runtime']){mkdirSync(dest+'/'+sub,{recursive:true});for(const n of readdirSync(original+'/'+sub))if(statSync(original+'/'+sub+'/'+n).isFile())copyFileSync(original+'/'+sub+'/'+n,dest+'/'+sub+'/'+n)}
for(const n of ['libllama.so','libllama.so.0','libllama.so.0.0.10579'])copyFileSync(root+'/build/libllama.so.0.0.10579',dest+'/bin/'+n);
console.log('Isolated smalltargetbatch runtime ready; production untouched');
