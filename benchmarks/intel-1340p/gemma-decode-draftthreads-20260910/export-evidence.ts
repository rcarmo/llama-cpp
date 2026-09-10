/** SCRIPT_JDOC:
{"summary":"Export independentdraftthread comparison and unchangedhybridrestoration to the authorisedfork","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import{readdirSync,readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync}from'node:fs';import{join,dirname}from'node:path';import{createHash}from'node:crypto';
const root=import.meta.dir,dst='/var/home/agent/workspace/projects/llama-cpp/benchmarks/intel-1340p/gemma-decode-draftthreads-20260910';
if(existsSync(dst))throw Error('Retained export exists');const files:any[]=[];const sha=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
function visit(rel=''){for(const e of readdirSync(join(root,rel),{withFileTypes:true})){const p=join(rel,e.name);if(e.isSymbolicLink())continue;if(e.isDirectory()){if(['baseline','slots','.syntax','runtime'].includes(e.name))continue;visit(p);continue}if(!e.isFile()||!(/\.(ts|json|md|txt|log|sh)$/.test(p)))continue;const data=readFileSync(join(root,p));if(data.length>12*1024*1024)throw Error('Large unexpected file');if(/-----BEGIN (?:OPENSSH |RSA |EC )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/.test(data.toString()))throw Error('Possible credential');mkdirSync(dirname(join(dst,p)),{recursive:true});copyFileSync(join(root,p),join(dst,p));files.push({path:p,bytes:data.length,sha256:sha(join(dst,p))});}}
visit();
const readme=`# Independent MTP draft decode threads,10September2026

Four draft threads were4.10% slower than eight on matched64K counting/recall. Eight counterbalanced runs; target smallbatch8/largeprefill16 and draftbatch16 fixed. Same128 output tokens/110 drafted/90 accepted, all recall/cache checks passed. No production change; retain draft8.

Read report.md. Run \x60bash verify-offline.sh\x60 with Bun to verify checksums, two audit tests, raw timings and restoration without inference. Models, runtime binaries, KV states and private baseline config are excluded. Historical stage scripts require fresh speech clearance and a current baseline before use.
`;
writeFileSync(join(dst,'README.md'),readme);writeFileSync(join(dst,'.gitattributes'),'*.log -whitespace\n');for(const p of ['README.md','.gitattributes'])files.push({path:p,bytes:readFileSync(join(dst,p)).length,sha256:sha(join(dst,p))});
files.sort((a,b)=>a.path.localeCompare(b.path));writeFileSync(join(dst,'manifest.json'),JSON.stringify({exported_at:new Date().toISOString(),status:'Completed independentdraftthread screen;4slowerthan8;productionunchanged',files,exclusions:['baselineprivatehybridconfig','runtimebinaries','models','KVstates']},null,2)+'\n');writeFileSync(join(dst,'checksums.sha256'),[...files.map(f=>f.sha256+'  '+f.path),sha(join(dst,'manifest.json'))+'  manifest.json'].join('\n')+'\n');console.log(files.length+2,'safe export files');
