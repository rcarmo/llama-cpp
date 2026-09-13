/** SCRIPT_JDOC:
{"summary":"Verify all eight performance results, dispatch, work parity, runtime maps and resource guards without reruns","kind":"read-only","weight":"lightweight","role":"entrypoint"}
*/
import{readFileSync}from'node:fs';import{createHash}from'node:crypto';import{summarize,guards}from'./metrics';
const root=import.meta.dir,read=(f:string)=>readFileSync(root+'/'+f,'utf8'),json=(f:string)=>JSON.parse(read(f)),check=(x:boolean,m:string)=>{if(!x)throw Error(m)};
const all=json('summary.json');check(all.complete&&all.runs===8,'Eight runs');check(Object.values(all.parity).every(Boolean),'Work/output parity');
for(let i=0;i<8;i++){
 const dir=`runs/r${i}/`,m=json(dir+'metrics.json'),s=json(dir+'summary.json'),r=json(dir+'result.json'),manifest=json(dir+'manifest.json');
 check(JSON.stringify(summarize(m))===JSON.stringify(s),'Recomputed metrics '+i);
 check(r.rc===0&&!r.abort&&r.services_unchanged,'Run status '+i);check(r.mtp.output===128&&m.emitted===128&&m.source_tokens===309,'Tokens '+i);
 check(r.mtp.drafted===96&&r.mtp.accepted===94,'MTP '+i);check(m.shared_bytes+m.copied_bytes===39845888,'KV '+i);
 for(const sample of r.samples)guards(sample);check(r.samples.some(s=>s.workers.length),'Active monitoring '+i);
 const maps=read(dir+'maps.txt');for(const f of Object.keys(manifest.hashes).filter(f=>f.includes('libllama.so')||f.includes('libggml-cpu.so')||f.includes('libggml-vulkan.so')))check(maps.includes(f.replace(/\.so\.0$/,'.so.0')),'Runtime map '+f);
 check(createHash('sha256').update(readFileSync(root+'/'+dir+'stdout.log')).digest('hex')===r.output_sha256,'Output hash');
 check(read(`evidence/unit-r${i}.log`).includes('(swap: 0B)'),'Unit zero swap '+i);
}
const failure=json('runs/r4-aborted-contention/result.json');check(failure.rc===137&&failure.abort.includes('Competing process'),'Original failure');
check(read('evidence/cleanup.txt').includes('ActiveState=inactive'),'Cleanup');
console.log('PASS: all8 stage recomputations, dispatch/work/output parity, model runtime mappings, sampled guards and unit zero-swap; original contention abort retained/excluded.');
