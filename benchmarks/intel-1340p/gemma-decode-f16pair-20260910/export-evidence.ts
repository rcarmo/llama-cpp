/** SCRIPT_JDOC:
{"summary":"Export saved decode experiment evidence to the authorised fork","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import{readdirSync,readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync}from'node:fs';import{join,dirname}from'node:path';import{createHash}from'node:crypto';
const root=import.meta.dir,dst='/var/home/agent/workspace/projects/llama-cpp/benchmarks/intel-1340p/gemma-decode-f16pair-20260910';
if(existsSync(dst))throw Error('Retained export exists');const files:any[]=[];const sha=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
function visit(rel=''){for(const e of readdirSync(join(root,rel),{withFileTypes:true})){const p=join(rel,e.name);if(e.isSymbolicLink())continue;if(e.isDirectory()){if(['baseline','slots','.syntax','runtime','runtime-cpu','source'].includes(e.name))continue;visit(p);continue}if(!e.isFile()||!(/\.(ts|json|md|txt|log|sh|patch|cpp|c|h)$/.test(p)))continue;const data=readFileSync(join(root,p));if(data.length>12*1024*1024)throw Error('Large unexpected file');if(/-----BEGIN (?:OPENSSH |RSA |EC )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/.test(data.toString()))throw Error('Possible credential');mkdirSync(dirname(join(dst,p)),{recursive:true});copyFileSync(join(root,p),join(dst,p));files.push({path:p,bytes:data.length,sha256:sha(join(dst,p))});}}
visit();
const readme=`# Negative paired-dot fallback experiment, 10 September 2026

Not deployed: paired fallback 0.84% slower in eight saved64K runs. Eight native cases pass per mode, but override traces cover n1 only. Hot n4 goes through llamafile GEMM.

Read report.md. Run \x60bash verify-offline.sh\x60 from this checkout with Bun to check hashes, reconstruct the pinned abdbeadfb source and audit saved evidence without inference. Models, runtime binaries, KV states and private baseline config are excluded. Historical heavy scripts require local retained inputs, fresh clearance and a refreshed current-production baseline; do not rerun old restoration scripts on a newer deployment.
`;
writeFileSync(join(dst,'README.md'),readme);writeFileSync(join(dst,'.gitattributes'),'*.log -whitespace\n*.patch -whitespace\n*.cpp -whitespace\n*.c -whitespace\n');for(const p of ['README.md','.gitattributes'])files.push({path:p,bytes:readFileSync(join(dst,p)).length,sha256:sha(join(dst,p))});
files.sort((a,b)=>a.path.localeCompare(b.path));writeFileSync(join(dst,'manifest.json'),JSON.stringify({exported_at:new Date().toISOString(),status:"Not deployed: paired fallback 0.84% slower in eight saved64K runs. Eight native cases pass per mode, but override traces cover n1 only. Hot n4 goes through llamafile GEMM.",files,exclusions:['baselineprivatehybridconfig','runtimebinaries','models','KVstates']},null,2)+'\n');writeFileSync(join(dst,'checksums.sha256'),[...files.map(f=>f.sha256+'  '+f.path),sha(join(dst,'manifest.json'))+'  manifest.json'].join('\n')+'\n');console.log(files.length+2,'safe export files');
