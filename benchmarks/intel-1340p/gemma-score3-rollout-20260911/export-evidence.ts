/** SCRIPT_JDOC:
{"summary":"Export saved decode experiment evidence to the authorised fork","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import{readdirSync,readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync}from'node:fs';import{join,dirname}from'node:path';import{createHash}from'node:crypto';
const root=import.meta.dir,dst='/var/home/agent/workspace/projects/llama-cpp/benchmarks/intel-1340p/gemma-score3-rollout-20260911';
if(existsSync(dst))throw Error('Retained export exists');const files:any[]=[];const sha=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
function visit(rel=''){for(const e of readdirSync(join(root,rel),{withFileTypes:true})){const p=join(rel,e.name);if(e.isSymbolicLink())continue;if(e.isDirectory()){if(['baseline','slots','.syntax','runtime','runtime-cpu','source'].includes(e.name))continue;visit(p);continue}if(!e.isFile()||!(/\.(ts|json|md|txt|log|sh|patch|cpp|c|h)$/.test(p)))continue;const data=readFileSync(join(root,p));if(data.length>12*1024*1024)throw Error('Large unexpected file');if(/-----BEGIN (?:OPENSSH |RSA |EC )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/.test(data.toString()))throw Error('Possible credential');mkdirSync(dirname(join(dst,p)),{recursive:true});copyFileSync(join(root,p),join(dst,p));files.push({path:p,bytes:data.length,sha256:sha(join(dst,p))});}}
visit();
const readme=`# Score3 production rollout, 11 September 2026

Deployed 20260911-score3-stopped after resumed 4K/finite64K/tools/cache and coldSSE gates. Earlier +3.124%decode comparison retained in the separate score3 experiment; not rerun. Deliberately stopped speech is checked fail-closed; previous ATTN4 rollback retained.

Read report.md. Run \x60bash verify-offline.sh\x60 for checksums and ten offline audit/guard tests, without inference. Runtime/model/KV/private baseline config excluded. Historical scripts require current local inputs and approval.
`;
writeFileSync(join(dst,'README.md'),readme);writeFileSync(join(dst,'.gitattributes'),'*.log -whitespace\n*.patch -whitespace\n*.cpp -whitespace\n*.c -whitespace\n');for(const p of ['README.md','.gitattributes'])files.push({path:p,bytes:readFileSync(join(dst,p)).length,sha256:sha(join(dst,p))});
files.sort((a,b)=>a.path.localeCompare(b.path));writeFileSync(join(dst,'manifest.json'),JSON.stringify({exported_at:new Date().toISOString(),status:"Deployed score3 with explicit stopped-speech guard; prior ATTN4 rollback",files,exclusions:['baselineprivatehybridconfig','runtimebinaries','models','KVstates']},null,2)+'\n');writeFileSync(join(dst,'checksums.sha256'),[...files.map(f=>f.sha256+'  '+f.path),sha(join(dst,'manifest.json'))+'  manifest.json'].join('\n')+'\n');console.log(files.length+2,'safe export files');
