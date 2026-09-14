/** SCRIPT_JDOC:
{"summary":"Audit matched saved64K coding generation, raw task evidence and exact production restoration without inference","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tests} from './task';
import {tests as repairTests} from './repair-task';
export function audit(root:string,variant:'coding'|'repair'='coding') {
 const expectedTests=variant==='repair'?repairTests:tests, expectedAssertions=variant==='repair'?16:43;
 const read=(p:string)=>JSON.parse(readFileSync(root+'/'+p,'utf8'));
 const assert=(v:unknown,s:string)=>{if(!v)throw Error(s)};
 const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
 const median=(a:number[])=>{const b=[...a].sort((a,b)=>a-b);return(b[Math.floor((b.length-1)/2)]+b[Math.floor(b.length/2)])/2};
 const rows:any[]=[];
 for(const[order,mode]of[0,1,1,0].entries()){
  const dir=`runs/${variant}-${order}-mode${mode}`;
  if(!existsSync(root+'/'+dir+'/result.json'))continue;
  const r=read(dir+'/result.json'),f=read(dir+'/fixture.json'),id=read(dir+'/runtime.json'),raw=read(dir+'/coding.json');
  assert(r.ok&&r.order===order&&r.mode===mode,'Completed profile order');
  assert(f.sha256===sha(JSON.stringify(f.body))&&f.sha256===r.fixture_sha256,'Fixture snapshot');
  assert(r.actual_tokens===f.tokens.length&&r.actual_tokens>=64663&&r.actual_tokens<=65536,'Actual context');
  assert(r.timings.cache_n>=64600&&r.timings.prompt_n<=750&&r.timings.cache_n+r.timings.prompt_n===r.actual_tokens,'Retained cache coverage');
  assert(r.timings.predicted_n<=640&&r.timings.predicted_n>0,'Bounded output');
  assert(raw.response.choices[0].message.content===r.content&&raw.response.timings.predicted_per_second===r.timings.predicted_per_second,'Raw generation');
  assert(id.sha256==='35289adccdf6965d3d7eb7ade2271723b1169e65772bf849c8a5431288d0aec9'&&Boolean(id.env.LLAMA_EXPERIMENTAL_SMALL_TARGET_BATCH==='1')===Boolean(mode),'Runtime mode identity');
  assert(!id.env.GGML_CPU_WHOLE_TOKEN_PROFILE&&!id.env.GGML_SPECULATIVE_PROFILE,'Unprofiled generation');
  for(const[key,value]of[['--threads','8'],['--threads-batch','16'],['--spec-draft-threads','8'],['--spec-draft-threads-batch','16']])assert(id.argv[id.argv.indexOf(key)+1]===value,'Target/draft factor isolation');
  assert(r.resources.peak_trial_swap_kib===0&&r.resources.min_available_kib>=6*1048576,'Resource envelope');
  let sandbox:any=null,codeHash:string|null=null;
  if(existsSync(root+'/'+dir+'/sandbox-result.json')){
   sandbox=read(dir+'/sandbox-result.json');
   assert(readFileSync(root+'/'+dir+'/sandbox/independent.test.ts','utf8')===expectedTests,'Independent tests unchanged');
   const code=readFileSync(root+'/'+dir+'/sandbox/candidate.ts','utf8');codeHash=sha(code);
   assert(read(dir+'/code-hash.json').sha256===codeHash,'Generated code hash');
   const a=sandbox.args;assert(a.includes('--network=none')&&a.includes('--read-only')&&a.includes('--memory=512m')&&a.includes('--pids-limit=64'),'Sandbox bounds');
   if(r.task_pass)assert(sandbox.pass&&sandbox.rc===0&&!sandbox.timedOut&&/6 pass/.test(sandbox.stderr)&&sandbox.stderr.includes(expectedAssertions+' expect() calls'),'Task acceptance records');
  }
  if(r.task_pass)assert(sandbox&&r.finish_reason!=='length','No truncated-task acceptance');
  rows.push({order,mode,task_pass:Boolean(r.task_pass),task_error:r.task_error,finish_reason:r.finish_reason,fixture_sha256:r.fixture_sha256,code_sha256:codeHash,cache_n:r.timings.cache_n,prompt_n:r.timings.prompt_n,prompt_ms:r.timings.prompt_ms,output_tokens:r.timings.predicted_n,decode_tps:r.timings.predicted_per_second,decode_ms:r.timings.predicted_ms,drafted:r.timings.draft_n,accepted:r.timings.draft_n_accepted,request_ms:raw.measurement.wall_ms,resources:r.resources,thermal:r.thermal,test_exit:sandbox?.rc,test_pass:sandbox?.pass});
 }
 assert(new Set(rows.map(r=>r.fixture_sha256)).size<=1,'Identical cold fixture');
 assert(new Set(rows.map(r=>`${r.cache_n}/${r.prompt_n}`)).size<=1,'Matched prompt cache work');
 const profiles:any={};for(const mode of [0,1]){const group=rows.filter(r=>r.mode===mode);profiles[mode]={n:group.length,passes:group.filter(r=>r.task_pass).length};for(const field of ['decode_tps','decode_ms','output_tokens','request_ms','prompt_ms'])profiles[mode][field]=group.length?median(group.map(r=>r[field])):null;}
 const complete=rows.length===4;
 let restoration:any=null;
 if(existsSync(root+'/restoration-check.json')){restoration=read('restoration-check.json');assert(restoration.pass&&restoration.swap_kib===0,'Unchanged hybrid restoration');}
 return{audit_pass:true,variant,complete,all_tasks_pass:complete&&rows.every(r=>r.task_pass),rows,profiles,decode_gain_pct:complete?100*(profiles[1].decode_tps/profiles[0].decode_tps-1):null,request_reduction_pct:complete?100*(1-profiles[1].request_ms/profiles[0].request_ms):null,matched_output_counts:new Set(rows.map(r=>r.output_tokens)).size<=1,observed_same_code:new Set(rows.map(r=>r.code_sha256)).size<=1,restoration,limits:['One interval coding task, two observations per mode; broad coding quality unqualified','Restored same64K history then evaluated coding instruction; no fresh-prefill or hybrid-routing speed claim','Retain truncations and task failures separately from native request completion','Output length/acceptance can change; compare exact work before attributing timings','Production configuration unchanged; smallbatch release is the baseline for further optimisation']};
}
if(import.meta.main){const results={coding:audit(import.meta.dir,'coding'),repair:audit(import.meta.dir,'repair')};for(const[variant,r]of Object.entries(results))writeFileSync(import.meta.dir+'/'+variant+'-results.json',JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(Object.fromEntries(Object.entries(results).map(([name,r])=>[name,{complete:r.complete,all_tasks_pass:r.all_tasks_pass,profiles:r.profiles,decode_gain_pct:r.decode_gain_pct,request_reduction_pct:r.request_reduction_pct}])),null,2))}
