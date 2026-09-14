/** SCRIPT_JDOC:
{"summary":"Stage bounded current-master qualification source and evidence without binaries, generated shaders or mutable admission files","kind":"mutating","weight":"standard","role":"entrypoint"}
*/
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, copyFileSync, cpSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root=import.meta.dir,dest='/var/home/agent/workspace/projects/llama-cpp/benchmarks/intel-1340p/xe-master-agentic-20260914';
mkdirSync(dest,{recursive:true});
// Only report entrypoints/docs/small manifests; generated source snapshots and binary builds stay local.
const files=readdirSync(root).filter(f=>/\.(ts|sh|md|json)$/.test(f)&&!f.endsWith('-admission.json'));
for(const f of files)copyFileSync(root+'/'+f,dest+'/'+f);
for(const dir of ['evidence','agentic-runs','charts'])if(existsSync(root+'/'+dir))cpSync(root+'/'+dir,dest+'/'+dir,{recursive:true});
mkdirSync(dest+'/vulkan-parent',{recursive:true});copyFileSync(root+'/vulkan-parent/CMakeLists.txt',dest+'/vulkan-parent/CMakeLists.txt');
// Keep the two historical outcome fixtures self-contained without changing the frozen runtime harness.
mkdirSync(dest+'/historical-outcomes',{recursive:true});
for(const name of ['clamp-candidate-boundary','clamp-baseline-control'])copyFileSync(root+'/../xe-hotspots-agentic-20260913/agentic-runs/'+name+'/result.json',dest+'/historical-outcomes/'+name+'.json');
let test=readFileSync(root+'/agentic-outcome.test.ts','utf8');
for(const name of ['clamp-candidate-boundary','clamp-baseline-control'])test=test.replace('/../xe-hotspots-agentic-20260913/agentic-runs/'+name+'/result.json','/historical-outcomes/'+name+'.json');
writeFileSync(dest+'/agentic-outcome.test.ts',test);
writeFileSync(dest+'/.gitattributes','**/*.log -whitespace\n**/maps.txt -whitespace\n**/*-maps.txt -whitespace\n**/*.patch -whitespace\n');
function walk(d:string,p=''):string[]{return readdirSync(d).sort().flatMap(f=>statSync(d+'/'+f).isDirectory()?walk(d+'/'+f,p+f+'/'):[p+f]);}
const all=walk(dest).filter(f=>f!=='SHA256SUMS');
for(const f of all){if(/\.(gguf|so|o|spv)$/.test(f))throw Error('Binary publication rejected '+f);if(statSync(dest+'/'+f).size>12*1024*1024)throw Error('Unexpectedly large evidence '+f);}
writeFileSync(dest+'/SHA256SUMS',all.map(f=>createHash('sha256').update(readFileSync(dest+'/'+f)).digest('hex')+'  '+f).join('\n')+'\n');
console.log(`Staged ${all.length} current-master evidence checksums; binaries/generated shader arrays excluded. Native verification scripts require local rebuilt assets.`);
