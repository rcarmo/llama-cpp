/** SCRIPT_JDOC:
{"summary":"Score bounded current-master task extension, retaining task failures and permitting timing only for identical within-runtime work","kind":"mixed","weight":"lightweight","role":"entrypoint"}
*/
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { verifyCurrent } from './verify-current';
const root=import.meta.dir,sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const order=[['master-median-on0','median','q6on'],['master-median-off0','median','q6off'],['master-defaults-off0','defaults','q6off'],['master-defaults-on0','defaults','q6on']];
const rows=order.filter(([id])=>existsSync(root+'/agentic-runs/'+id+'/result.json')).map(([id,kind,arm])=>{
 const r=verifyCurrent(id),dir=root+'/agentic-runs/'+id;
 const prompts=r.rounds.map((_,i)=>{const x=JSON.parse(readFileSync(dir+`/round-${i}.json`,'utf8'));return sha(JSON.stringify({messages:x.messages,tools:x.tools}));});
 return{id,kind,arm,success:r.success,phases:r.phases,failure:r.failure_reason,final_artifact_ok:r.success||r.final_artifact_grade?.ok===true,rounds:r.rounds.length,whole_ms:r.wall_ms,warm_s:r.rounds.slice(1).reduce((s,x)=>s+x.wall_s,0),handoff_ms:r.rounds[0].handoff_ms,work:Object.fromEntries(['generated_tokens','evaluated_prompt_tokens','drafted','accepted'].map(k=>[k,r.rounds.reduce((s,x)=>s+x[k],0)])),prompts,raw_hash:sha(JSON.stringify(r.rounds.map(x=>x.raw))),source_hash:sha(readFileSync(dir+'/fixture/src/main.ts','utf8'))};
});
const pairs=['median','defaults'].map(kind=>{
 const off=rows.find(x=>x.kind===kind&&x.arm==='q6off'),on=rows.find(x=>x.kind===kind&&x.arm==='q6on');
 if(!off||!on)return{kind,complete:false};
 const same=JSON.stringify(off.prompts)===JSON.stringify(on.prompts)&&off.raw_hash===on.raw_hash&&JSON.stringify(off.work)===JSON.stringify(on.work),comparable=same&&off.success&&on.success;
 return{kind,complete:true,same_work:same,both_pass:off.success&&on.success,comparable,whole_change_percent:comparable?100*(on.whole_ms/off.whole_ms-1):null,warm_change_percent:comparable?100*(on.warm_s/off.warm_s-1):null,handoff_change_ms:comparable?on.handoff_ms-off.handoff_ms:null};
});
const result={complete:rows.length===4,rows,pairs,workflow_passes:rows.filter(x=>x.success).length,artifact_passes:rows.filter(x=>x.final_artifact_ok).length,note:'One pair per task; current-runtime Q6 effect only, not pre/post-master timing. Clamp pilot excluded.'};
writeFileSync(root+'/task-summary.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
