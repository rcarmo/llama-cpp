/** SCRIPT_JDOC:
{"summary":"Audit score-only 3x4 candidate against deployed ATTN4 from saved native/timing/restoration evidence","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import { readFileSync, writeFileSync } from 'node:fs';
export function audit(root: string) {
 const read=(p:string)=>JSON.parse(readFileSync(root+'/'+p,'utf8'));
 const assert=(v:unknown,s:string)=>{if(!v)throw Error(s)};
 const median=(a:number[])=>{const v=[...a].sort((a,b)=>a-b);return(v[1]+v[2])/2};
 const native=read('runs/native-score3-numerics-validated/result.json');
 assert(native.ok&&native.rows.length===2&&native.rows.every(r=>r.pass&&r.rc===0),'Native modes');
 for(const mode of[0,1])assert(readFileSync(root+`/runs/native-score3-numerics-validated/mode${mode}.log`,'utf8').includes('11/11 tests passed'),'11 actual cases');
 const log=readFileSync(root+'/runs/native-score3-numerics-validated/mode1.log','utf8');
 const traces=[...log.matchAll(/SCORE4_3ROW m=(\d+) n=(\d+) k=(\d+) tail=(\d+) threads=(\d+)/g)].map(x=>({m:+x[1],n:+x[2],k:+x[3],tail:+x[4],threads:+x[5]}));
 assert(traces.length>0&&traces.every(r=>r.n===4&&r.k===512&&r.m>=32768&&r.threads===8&&r.tail===r.m%3),'Score dispatch');
 assert(JSON.stringify([...new Set(traces.map(r=>r.m))].sort((a,b)=>a-b))==='[32768,32784,64768,65024,65536]','Actual tail shapes');
 const rows=[0,1,1,0,1,0,0,1].map((mode,order)=>{
  const dir=`runs/confirm-${order}-mode${mode}`,r=read(dir+'/result.json'),raw=read(dir+'/decode.json'),argv=read(dir+'/cpu-argv.json'),env=r.config.extraEnv;
  assert(r.ok&&r.pass&&r.order===order&&r.threads===mode,'Run/order');
  assert(env.LLAMA_EXPERIMENTAL_SMALL_TARGET_BATCH==='1'&&env.GGML_CPU_EXPERIMENTAL_ATTN4==='1'&&(env.GGML_CPU_EXPERIMENTAL_SCORE4_3ROW==='1')===Boolean(mode),'Fixed baseline/isolated candidate');
  assert(!Object.keys(env).some(k=>k.endsWith('_TRACE')||k.includes('PROFILE')||k.includes('F16_PAIR')),'Timing instrumentation');
  for(const[k,v]of[['--threads','8'],['--threads-batch','16'],['--spec-draft-threads','8'],['--spec-draft-threads-batch','16']])assert(argv.includes(k)&&argv[argv.indexOf(k)+1]===v,'Fixed thread pools');
  assert(r.timings.cache_n===64658&&r.timings.prompt_n===25&&r.timings.predicted_n===128,'Matched work');
  assert(JSON.stringify(raw.response.timings)===JSON.stringify(r.timings),'Raw timings');
  assert(['CEDAR-481','MAPLE-726','BIRCH-953'].every(k=>r.answer.includes(k)),'Recall');
  assert(r.resources.peak_trial_swap_kib===0&&r.resources.min_available_kib>=6*1048576,'Resource limits');
  return{order,mode,tps:r.timings.predicted_per_second,request_ms:raw.measurement.wall_ms,token_hash:raw.measurement.token_hash,drafted:r.timings.draft_n,accepted:r.timings.draft_n_accepted,resources:r.resources,thermal:r.thermal,finished_at:r.finished_at};
 });
 const profiles=Object.fromEntries([0,1].map(mode=>{const a=rows.filter(r=>r.mode===mode);return[mode,{n:a.length,tps:median(a.map(r=>r.tps)),request_ms:median(a.map(r=>r.request_ms)),tps_min:Math.min(...a.map(r=>r.tps)),tps_max:Math.max(...a.map(r=>r.tps))}]}));
 const provenance=read('runtime-provenance.json');assert(provenance.env.GGML_CPU_EXPERIMENTAL_SCORE4_3ROW==='1'&&provenance.env.GGML_CPU_EXPERIMENTAL_ATTN4==='1','Live candidate flags');
 const restore=read('restoration-check.json');assert(restore.pass&&restore.swap_kib===0&&restore.libraries.every(l=>l.mapped&&l.actual===l.expected),'Restored ATTN4');assert(Date.parse(restore.verified_at)>Math.max(...rows.map(r=>Date.parse(r.finished_at))),'Restoration after timing block');
 const aborted=read('runs/prefill4k-mode0/guard-stop.json'),post=read('post-abort-deployment-check.json'),smoke=read('post-abort-restoration-check.json');
 assert(aborted.reason.includes('Speech socket')&&aborted.servers.every(s=>s.swap_kib===0),'Qualification guard reason');
 assert(post.pass&&post.release.endsWith('/20260911-attn4')&&post.cpu_swap_kib===0,'Unchanged deployment after abort');
 assert(smoke.pass&&Date.parse(smoke.verified_at)>Date.parse(aborted.at)&&smoke.info.pid===post.info.pid,'Post-abort tools/cache');
 return{audit_pass:true,qualification_aborted:true,post_abort_restoration:{pass:true,info:post.info},rows,profiles,decode_gain_pct:100*(profiles[1].tps/profiles[0].tps-1),request_reduction_pct:100*(1-profiles[1].request_ms/profiles[0].request_ms),native:{cases_per_mode:11,m_values:[...new Set(traces.map(r=>r.m))].sort((a,b)=>a-b),tail_values:[...new Set(traces.map(r=>r.tail))].sort()},diagnostics:{identical_output_hashes:new Set(rows.map(r=>r.token_hash)).size===1,matched_draft_counts:rows.every(r=>r.drafted===110&&r.accepted===90)},restoration:{pass:true,info:restore.info,verified_at:restore.verified_at},limits:['One64K counting/recall fixture,four runs/profile','Historical profile from smallbatch,not new deployedATTN4 profiler','Candidate changes tile and job geometry together; mechanisms not isolated','No finite-state/tool-slot qualification of candidate beyond native tests and timed recall; no deployment']};
}
if(import.meta.main){const r=audit(import.meta.dir);writeFileSync(import.meta.dir+'/results.json',JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({audit_pass:r.audit_pass,profiles:r.profiles,gain:r.decode_gain_pct,request_reduction:r.request_reduction_pct},null,2))}
