/** SCRIPT_JDOC:
{"summary":"Reconstruct independentMTPdraftthread comparison from actualargv, rawtimings and unchangedrestoration","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import{readFileSync,writeFileSync,existsSync}from'node:fs';
export function audit(root:string){
 const read=(p:string)=>JSON.parse(readFileSync(root+'/'+p,'utf8')),assert=(v:any,s:string)=>{if(!v)throw Error(s)},median=(a:number[])=>{const b=[...a].sort((a,b)=>a-b);return(b[Math.floor((b.length-1)/2)]+b[Math.floor(b.length/2)])/2};
 const rows:any[]=[];
 for(const[i,threads]of[8,4,4,8,4,8,8,4].entries()){
  const dir=`runs/draft-${i}-t${threads}`;if(!existsSync(root+'/'+dir+'/result.json'))continue;
  const r=read(dir+'/result.json'),raw=read(dir+'/decode.json'),id=read(dir+'/runtime.json');
  assert(r.ok&&r.pass&&r.order===i&&r.threads===threads,'Profile result');
  assert(r.timings.cache_n===64658&&r.timings.prompt_n===25&&r.timings.predicted_n===128,'Matched native work');
  assert(['CEDAR-481','MAPLE-726','BIRCH-953'].every(k=>raw.response.content.includes(k))&&raw.response.content===r.answer,'Raw recall');
  assert(id.sha256==='35289adccdf6965d3d7eb7ade2271723b1169e65772bf849c8a5431288d0aec9'&&id.env.LLAMA_EXPERIMENTAL_SMALL_TARGET_BATCH==='1'&&!id.env.GGML_CPU_WHOLE_TOKEN_PROFILE&&!id.env.GGML_SPECULATIVE_PROFILE,'Deployed baseline identity');
  for(const[k,v]of[['--threads','8'],['--threads-batch','16'],['--spec-draft-threads',String(threads)],['--spec-draft-threads-batch','16']])assert(id.argv[id.argv.indexOf(k)+1]===v,'Independent draft factor');
  assert(r.resources.min_available_kib>=6*1048576&&r.resources.peak_trial_swap_kib===0,'Resource envelope');
  rows.push({order:i,threads,decode_tps:r.timings.predicted_per_second,decode_ms:r.timings.predicted_ms,prompt_ms:r.timings.prompt_ms,request_ms:raw.measurement.wall_ms,drafted:r.timings.draft_n,accepted:r.timings.draft_n_accepted,token_hash:raw.measurement.token_hash,resources:r.resources,thermal:r.thermal});
 }
 const profiles:any={};for(const threads of[8,4]){const r=rows.filter(x=>x.threads===threads);profiles[threads]={n:r.length};for(const field of['decode_tps','decode_ms','prompt_ms','request_ms'])profiles[threads][field]=r.length?median(r.map(x=>x[field])):null;}
 const complete=rows.length===8;let restoration:any=null;if(existsSync(root+'/restoration-check.json')){restoration=read('restoration-check.json');assert(restoration.pass&&restoration.swap_kib===0,'Currenthybridrestored');}
 return{audit_pass:true,complete,rows,profiles,decode_gain_pct:complete?100*(profiles[4].decode_tps/profiles[8].decode_tps-1):null,request_reduction_pct:complete?100*(1-profiles[4].request_ms/profiles[8].request_ms):null,observed_same_tokens:new Set(rows.map(x=>x.token_hash)).size<=1,restoration,limits:['One128token countingrecall fixture,four/profile,notnewcodingquality','Onlydraftdecode threadcountvaries,targetsmallbatchalreadyenabled','Noaffinitychange;noDRAMbandwidth/CPUcoreplacementclaim','Smallgainrequirescomparisonwithrunspread;nocandidatepromotioninthiscampaign']};
}
if(import.meta.main){const r=audit(import.meta.dir);writeFileSync(import.meta.dir+'/results.json',JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({complete:r.complete,profiles:r.profiles,decode_gain_pct:r.decode_gain_pct,request_reduction_pct:r.request_reduction_pct},null,2))}
