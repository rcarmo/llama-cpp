/** SCRIPT_JDOC:
{"summary":"Stage only promoted Q6 and Vulkan probe source/evidence into the existing benchmark publication and refresh checksums","kind":"mutating","weight":"standard","role":"entrypoint"}
*/
import { readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root=import.meta.dir, dest='/var/home/agent/workspace/projects/llama-cpp/benchmarks/intel-1340p/xe-hotspots-agentic-20260913';
const files=[
 'README.md','opportunities.md','q6-promoted-results.md','vulkan-large-results.md','vulkan-o1-results.md','vulkan-o1-screen-plan.md','verify-promoted-q6.ts','publish-promoted.ts',
 'q6-integration-design.md','q6-portable-integration-plan.md','build-q6-portable.sh','build-q6-cmake.sh','run-q6-cmake-test-r1.sh',
 'prepare-promoted-q6.ts','agentic-runner-promoted-q6.ts','launch-agentic-promoted-q6.sh',
 'vulkan-large-tile-plan.md','vulkan-ffn-probe.cpp','vulkan-ffn-control.cpp','prepare-vulkan-probe.ts','prepare-vulkan-large.ts','prepare-vulkan-confirm.ts','prepare-vulkan-screen.ts',
 'build-vulkan-probe.sh','build-vulkan-probe-o0.sh','build-vulkan-large.sh','build-vulkan-confirm.sh',
 'run-vulkan-probe.ts','launch-vulkan-probe.sh','run-vulkan-control.ts','launch-vulkan-control.sh','vulkan-control-output.ts','vulkan-control-output.test.ts',
 'run-vulkan-screen.ts','launch-vulkan-screen.sh','vulkan-screen-output.ts','vulkan-screen-output.test.ts',
 'q6-implementation-source','agentic-runs/q6-promoted-clamp-on','vulkan-large-offon','vulkan-o1-screen',
];
for(const f of files){if(!existsSync(root+'/'+f))throw Error('Missing publication source '+f);}
const evidence=readdirSync(root+'/evidence').filter(f=>/^(q6-(cmake|portable|promoted)|vulkan-|unit-(vulkan-|q6-promoted))/.test(f));
for(const f of [...files,...evidence.map(f=>'evidence/'+f)]){mkdirSync(dest+'/'+f.split('/').slice(0,-1).join('/'),{recursive:true});cpSync(root+'/'+f,dest+'/'+f,{recursive:true});}
function walk(dir:string,prefix=''):string[]{return readdirSync(dir).sort().flatMap(f=>{const p=prefix+f;return statSync(dir+'/'+f).isDirectory()?walk(dir+'/'+f,p+'/'):[p];});}
const all=walk(dest).filter(f=>f!=='SHA256SUMS');
writeFileSync(dest+'/SHA256SUMS',all.map(f=>createHash('sha256').update(readFileSync(dest+'/'+f)).digest('hex')+'  '+f).join('\n')+'\n');
console.log(`Staged ${files.length} selected sources/trees and ${evidence.length} logs/manifests; ${all.length} publication checksums. No binaries/weights/admission files copied.`);
