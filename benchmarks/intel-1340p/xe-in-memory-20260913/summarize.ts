/** SCRIPT_JDOC:
{"summary":"Summarise fixed-order optimised handoff trials, parity and stage medians","kind":"read-only","weight":"lightweight","role":"entrypoint"}
*/
import{readFileSync,writeFileSync,readdirSync,existsSync}from'node:fs';import{summarize,median}from'./metrics';
const root=import.meta.dir,dirs=readdirSync(root+'/runs').filter(n=>/^r[0-7]$/.test(n)).sort();const rows=dirs.map(name=>{
 const load=(p:string)=>JSON.parse(readFileSync(`${root}/runs/${name}/${p}`,'utf8'));const result=load('result.json'),manifest=load('manifest.json'),summary=summarize(load('metrics.json'));
 if(result.rc||result.abort||!result.services_unchanged)throw Error(name+' failed');
 return{name,...summary,output_hash:result.output_sha256,prompt_hash:manifest.prompt_sha256,binary_hash:Object.entries(manifest.hashes).find(([path])=>path.endsWith('/release/bin/handoff-perf'))?.[1],mtp_drafted:result.mtp.drafted,mtp_accepted:result.mtp.accepted,min_available_gib:Math.min(...result.samples.map(s=>s.available_kib))/1048576,max_worker_swap_mib:Math.max(...result.samples.flatMap(s=>s.workers.map(w=>w.swap_kib)))/1024,max_temp_c:Math.max(...result.samples.map(s=>s.temp_c)),throttle_delta:result.samples.at(-1).throttle-result.samples[0].throttle};
});
const parityKeys=['prompt_hash','binary_hash','prompt_tokens','output_tokens','target_evaluated_tokens','kv_bytes','mtp_drafted','mtp_accepted','output_hash'];const parity=Object.fromEntries(parityKeys.map(k=>[k,new Set(rows.map(r=>r[k])).size===1]));
const keys=['handoff_ms','ttft_process_s','ttft_post_prefill_s','warm_decode_tps','warm_decode_s','generation_tps','gpu_prefill_s','gpu_prefill_tps','source_load_s','cpu_load_s','assistant_load_s','source_context_s','cpu_context_s','assistant_context_s','source_release_s','first_reeval_s','wall_s'];
const groups=Object.fromEntries(['share','copy'].map(arm=>{const r=rows.filter(r=>r.arm===arm);if(!r.length)throw Error('Missing arm');return[arm,Object.fromEntries(keys.map(k=>[k,{median:median(r.map(r=>r[k])),min:Math.min(...r.map(r=>r[k])),max:Math.max(...r.map(r=>r[k]))}]))]}));
const deltas=Object.fromEntries(keys.map(k=>[k,{difference:groups.share[k].median-groups.copy[k].median,percent:(groups.share[k].median/groups.copy[k].median-1)*100}]));
const summary={runs:rows.length,complete:rows.length===8,parity,groups,deltas,rows};writeFileSync(root+'/summary.json',JSON.stringify(summary,null,2)+'\n');
const headers=['name','arm','prompt_tokens','output_tokens','kv_bytes',...keys,'mtp_drafted','mtp_accepted','max_worker_swap_mib','max_temp_c'];writeFileSync(root+'/results.csv',[headers.join(','),...rows.map(r=>headers.map(k=>r[k]).join(','))].join('\n')+'\n');console.log(JSON.stringify({runs:rows.length,parity,groups,deltas},null,2));
