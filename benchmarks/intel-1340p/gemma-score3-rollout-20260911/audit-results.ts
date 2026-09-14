/** SCRIPT_JDOC:
{"summary":"Audit resumed score3 qualification and stopped-speech production rollout using saved evidence","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import { readFileSync, writeFileSync } from 'node:fs';
export function audit(root: string) {
 const read=(p:string)=>JSON.parse(readFileSync(root+'/'+p,'utf8'));
 const assert=(v:unknown,s:string)=>{if(!v)throw Error(s)};
 const resources=(r:any)=>assert(r.resources.peak_trial_swap_kib===0&&r.resources.min_available_kib>=6*1048576,'Resource limits');
 const prefill=[0,1].map(mode=>{
  const dir=`runs/prefill4k-mode${mode}`,r=read(dir+'/result.json'),raw=read(dir+'/prefill.json');
  assert(r.ok,'Prefill complete');resources(r);
  const env=r.config.extraEnv;assert(env.LLAMA_EXPERIMENTAL_SMALL_TARGET_BATCH==='1'&&env.GGML_CPU_EXPERIMENTAL_ATTN4==='1'&&(env.GGML_CPU_EXPERIMENTAL_SCORE4_3ROW==='1')===Boolean(mode),'Prefill factor');
  const t=raw.response.timings;assert(t.prompt_n===4096&&t.predicted_n===1&&t.cache_n===0,'Prefill counts');
  assert(t.prompt_ms===r.calls.find(c=>c.label==='prefill').timings.prompt_ms,'Raw prefill timing');
  return{mode,prompt_ms:t.prompt_ms,request_ms:raw.measurement.wall_ms};
 });
 assert(prefill[1].prompt_ms/prefill[0].prompt_ms<=1.05,'Prefill gate');
 const l=read('runs/score3-64-lifecycle/result.json');resources(l);
 assert(l.ok&&l.finite_state&&l.total_nan===0&&l.total_inf===0,'Finite state');
 assert(l.tool_answer==='23'&&l.append==='MAPLE-726'&&l.append_cache===64684&&l.append_evaluated===15,'Tools and long cache');
 const p=read('production-smoke.json'),r=read('release.json'),d=read('deployment-check.json'),samples=read('cutover-guard-samples.json');
 assert(p.pass&&p.continuous_guard&&p.cpu_swap_kib===0,'Production smoke');
 assert(p.rows.length===4&&p.rows[0].route==='gpu-cold'&&p.rows[0].timings.cache_n===5235&&p.rows[0].timings.prompt_n===1,'Cold SSE handoff');
 for(const row of p.rows.slice(1))assert(row.response.timings.cache_n>=5235,'Warm reuse');
 assert(p.rows[1].response.choices[0].message.content.trim()==='23'&&p.rows[2].response.choices[0].message.content.trim()==='23'&&p.rows[3].response.choices[0].message.content.trim()==='RESTORED','Warm answers');
 for(const flag of ['LLAMA_EXPERIMENTAL_SMALL_TARGET_BATCH=1','GGML_CPU_EXPERIMENTAL_ATTN4=1','GGML_CPU_EXPERIMENTAL_SCORE4_3ROW=1'])assert(p.experimental_flags.includes(flag),'Live flag');
 assert(r.cpu_backend_sha256==='f288945950f823924282dc70f5d1b68ea8750f0b4ab29adb14e4db5016468ba1','Unchanged candidate binary');
 assert(d.pass&&d.info.pid===p.info.pid&&d.speech_mode==='stopped'&&d.gpu_profile_unchanged&&d.cpu_swap_kib===0,'Live deployment');
 assert(d.libraries.every(x=>x.mapped&&x.actual===x.expected),'Loaded identities');
 assert(samples.length===92&&samples.every(x=>x.available_kib>=6*1048576&&x.workers.every(w=>w.swap_kib===0)),'Continuous cutover resources');
 assert(samples.some(x=>x.workers.some(w=>w.port==='18093')),'Actual GPU samples');
 return{audit_pass:true,prefill,prefill_change_pct:100*(prefill[1].prompt_ms/prefill[0].prompt_ms-1),finite_state:true,tools:true,append_cache:l.append_cache,append_evaluated:l.append_evaluated,production:{release:r.release,previous:r.previous,info:d.info,verified_at:d.verified_at,speech_mode:d.speech_mode,cpu_backend_sha256:r.cpu_backend_sha256},cutover:{samples:samples.length,min_available_gib:Math.min(...samples.map(x=>x.available_kib))/1048576,peak_worker_swap_kib:Math.max(...samples.flatMap(x=>x.workers.map(w=>w.swap_kib)))},limits:['No new throughput comparison: previously measured +3.124% retained in score3 experiment','One4K prefill pair; short productionSSE does not exercise longscoretile','Populateddual128K and broadlongcoding quality remain unqualified','Stopped speech mode blocks GPU if speech restarts; CPU fallback still available']};
}
if(import.meta.main){const r=audit(import.meta.dir);writeFileSync(import.meta.dir+'/results.json',JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r,null,2))}
