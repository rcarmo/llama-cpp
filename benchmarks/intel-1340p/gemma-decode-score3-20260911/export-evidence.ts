/** SCRIPT_JDOC:
{"summary":"Export saved decode experiment evidence to the authorised fork","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import{readdirSync,readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync}from'node:fs';import{join,dirname}from'node:path';import{createHash}from'node:crypto';
const root=import.meta.dir,dst='/var/home/agent/workspace/projects/llama-cpp/benchmarks/intel-1340p/gemma-decode-score3-20260911';
if(existsSync(dst))throw Error('Retained export exists');const files:any[]=[];const sha=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
function visit(rel=''){for(const e of readdirSync(join(root,rel),{withFileTypes:true})){const p=join(rel,e.name);if(e.isSymbolicLink())continue;if(e.isDirectory()){if(['baseline','slots','.syntax','runtime','runtime-cpu','source'].includes(e.name))continue;visit(p);continue}if(!e.isFile()||!(/\.(ts|json|md|txt|log|sh|patch|cpp|c|h)$/.test(p)))continue;const data=readFileSync(join(root,p));if(data.length>12*1024*1024)throw Error('Large unexpected file');if(/-----BEGIN (?:OPENSSH |RSA |EC )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/.test(data.toString()))throw Error('Possible credential');mkdirSync(dirname(join(dst,p)),{recursive:true});copyFileSync(join(root,p),join(dst,p));files.push({path:p,bytes:data.length,sha256:sha(join(dst,p))});}}
visit();
const readme=`# Score-only 3x4 tile, 11 September 2026

Not deployed. Eight saved64K comparisons give +3.12% median decode over deployed ATTN4. Native11cases/mode and all row tails pass. Qualification aborted on speech queued bytes before candidate finite-state checks; ATTN4 restored and tools/cache verified. No retry/cutover.

Read report.md. Run \x60bash verify-offline.sh\x60 to reconstruct the pinned source plus ATTN4 and score3 patches, check all hashes and rerun six offline tests. Models, binaries, KV states and private baseline config are excluded. campaign-measured.ts preserves the exact measured harness; campaign.ts includes the later offline-tested abort fix. Heavy scripts need fresh clearance/current baseline; do not run them automatically.
`;
writeFileSync(join(dst,'README.md'),readme);writeFileSync(join(dst,'.gitattributes'),'*.log -whitespace\n*.patch -whitespace\n*.cpp -whitespace\n*.c -whitespace\n');for(const p of ['README.md','.gitattributes'])files.push({path:p,bytes:readFileSync(join(dst,p)).length,sha256:sha(join(dst,p))});
files.sort((a,b)=>a.path.localeCompare(b.path));writeFileSync(join(dst,'manifest.json'),JSON.stringify({exported_at:new Date().toISOString(),status:"Experimental score3 +3.12%; qualification aborted on speech queue; production unchanged ATTN4",files,exclusions:['baselineprivatehybridconfig','runtimebinaries','models','KVstates']},null,2)+'\n');writeFileSync(join(dst,'checksums.sha256'),[...files.map(f=>f.sha256+'  '+f.path),sha(join(dst,'manifest.json'))+'  manifest.json'].join('\n')+'\n');console.log(files.length+2,'safe export files');
