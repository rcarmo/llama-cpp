/** SCRIPT_JDOC:
{"summary":"Audit saved four-query F16 tile timings, native coverage and qualification without inference","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import { readFileSync, writeFileSync } from 'node:fs';
export function audit(root: string) {
 const read = (p: string) => JSON.parse(readFileSync(root + '/' + p, 'utf8'));
 const assert = (v: unknown, s: string) => { if (!v) throw Error(s); };
 const median = (v: number[]) => { const a = [...v].sort((a,b)=>a-b); return (a[1]+a[2])/2; };
 const resources = (r: any) => assert(r.resources.peak_trial_swap_kib === 0 && r.resources.min_available_kib >= 6*1048576, 'Resource limits');
 const rows = [0,1,1,0,1,0,0,1].map((mode, order) => {
  const dir = `runs/confirm-${order}-mode${mode}`, r = read(dir+'/result.json'), raw = read(dir+'/decode.json'), argv = read(dir+'/cpu-argv.json');
  assert(r.ok && r.pass && r.order === order && r.threads === mode, 'Order/pass');
  const env = r.config.extraEnv;
  assert(env.LLAMA_EXPERIMENTAL_SMALL_TARGET_BATCH === '1' && (env.GGML_CPU_EXPERIMENTAL_ATTN4 === '1') === Boolean(mode), 'Isolated tile flag');
  assert(!env.GGML_CPU_ATTN4_TRACE && !env.GGML_CPU_EXPERIMENTAL_F16_PAIR && !env.GGML_CPU_SHAPE_PROFILE, 'No timing instrumentation');
  for (const [key,value] of [['--threads','8'],['--threads-batch','16'],['--spec-draft-threads','8'],['--spec-draft-threads-batch','16']]) assert(argv.includes(key) && argv[argv.indexOf(key)+1] === value, 'Thread pools');
  assert(r.config.cpuCtx === 262144 && r.config.parallel === 2 && r.config.fa === false && r.config.format === 'f16', 'Geometry');
  assert(r.timings.cache_n === 64658 && r.timings.prompt_n === 25 && r.timings.predicted_n === 128, 'Matched work');
  assert(JSON.stringify(raw.response.timings) === JSON.stringify(r.timings), 'Raw timing');
  assert(['CEDAR-481','MAPLE-726','BIRCH-953'].every(k=>r.answer.includes(k)), 'Recall');
  resources(r);
  return {order,mode,tps:r.timings.predicted_per_second,request_ms:raw.measurement.wall_ms,token_hash:raw.measurement.token_hash,drafted:r.timings.draft_n,accepted:r.timings.draft_n_accepted,resources:r.resources,thermal:r.thermal};
 });
 const profiles = Object.fromEntries([0,1].map(mode=>{const a=rows.filter(r=>r.mode===mode);return [mode,{n:a.length,tps:median(a.map(r=>r.tps)),request_ms:median(a.map(r=>r.request_ms))}]}));
 const native = read('runs/native-attn4-numerics/result.json');
 assert(native.ok && native.rows.length === 2 && native.rows.every(r=>r.pass && r.rc===0), 'Native result');
 for (const mode of [0,1]) assert(readFileSync(root+`/runs/native-attn4-numerics/mode${mode}.log`,'utf8').includes('8/8 tests passed'), 'Native cases');
 const traces = [...readFileSync(root+'/runs/native-attn4-numerics/mode1.log','utf8').matchAll(/ATTN4_TILE m=(\d+) n=(\d+) k=(\d+) tile=2x4 threads=(\d+)/g)].map(m=>({m:+m[1],n:+m[2],k:+m[3],threads:+m[4]}));
 const shapes = [...new Set(traces.map(r=>`${r.m},${r.n},${r.k},${r.threads}`))].sort();
 assert(JSON.stringify(shapes)===JSON.stringify(['32768,4,512,8','512,4,32768,8','512,4,65536,8','65536,4,512,8'].sort()), 'Actual n4 dispatch');
 const prefill = [0,1].map(mode=>{const r=read(`runs/prefill4k-mode${mode}/result.json`);assert(r.ok,'Prefill pass');resources(r);const c=r.calls.find(c=>c.label==='prefill');assert(c.timings.prompt_n===4096 && c.timings.cache_n===0,'Prefill coverage');assert(r.config.extraEnv.LLAMA_EXPERIMENTAL_SMALL_TARGET_BATCH==='1' && (r.config.extraEnv.GGML_CPU_EXPERIMENTAL_ATTN4==='1')===Boolean(mode),'Prefill factor');return {mode,prompt_ms:c.timings.prompt_ms,wall_ms:c.wall_ms};});
 const lifecycle = read('runs/attn4-64-lifecycle/result.json');resources(lifecycle);
 assert(lifecycle.ok && lifecycle.finite_state && lifecycle.total_nan===0 && lifecycle.total_inf===0,'Finite state');
 assert(lifecycle.tool_answer==='23' && lifecycle.append==='MAPLE-726' && lifecycle.append_cache===64684 && lifecycle.append_evaluated===15,'Independent tools and long cache');
 const provenance = read('runtime-provenance.json');
 assert(provenance.env.GGML_CPU_EXPERIMENTAL_ATTN4==='1' && provenance.env.LLAMA_EXPERIMENTAL_SMALL_TARGET_BATCH==='1','Live qualification flags');
 assert(provenance.mapped_files.some(f=>f.path.includes('libggml-cpu') && f.sha256==='98c168824a2ee8e44115a3511de97ced820b1601b5d2e210fae2f589f24a12fa'),'Live backend hash');
 return {audit_pass:true,rows,profiles,decode_gain_pct:100*(profiles[1].tps/profiles[0].tps-1),request_reduction_pct:100*(1-profiles[1].request_ms/profiles[0].request_ms),all_candidates_faster:Math.min(...rows.filter(r=>r.mode).map(r=>r.tps))>Math.max(...rows.filter(r=>!r.mode).map(r=>r.tps)),diagnostics:{identical_output_hashes:new Set(rows.map(r=>r.token_hash)).size===1,matched_draft_counts:rows.every(r=>r.drafted===110 && r.accepted===90)},native:{cases_per_mode:8,shapes},prefill,prefill_change_pct:100*(prefill[1].prompt_ms/prefill[0].prompt_ms-1),qualification:{finite_state:true,tools:true,append_cache:64684,append_evaluated:15},limits:['One64K counting/recall fixture; four repeats/profile','Single4K prefill pair does not prove broad non-regression','Qualification runtime map captured separately, not retroactive timing-run maps','Deployment status is separate from this offline audit']};
}
if(import.meta.main){const r=audit(import.meta.dir);writeFileSync(import.meta.dir+'/results.json',JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({audit_pass:r.audit_pass,profiles:r.profiles,gain:r.decode_gain_pct,request_reduction:r.request_reduction_pct,prefill_change:r.prefill_change_pct},null,2));}
