/** SCRIPT_JDOC:
{"summary":"Compare three long-task arms only when complete independent grades and work parity permit; preserve failures and per-phase observations","kind":"mixed","weight":"lightweight","role":"entrypoint"}
*/
import{readFileSync,writeFileSync,existsSync}from'node:fs';import{verifyRun}from'./verify-run';
const root=import.meta.dir,f=JSON.parse(readFileSync(root+'/freeze.json','utf8'));
const rows=f.order.filter(id=>existsSync(root+'/runs/'+id+'/result.json')).map(id=>verifyRun(id));
const med=(a:number[])=>{a=[...a].sort((x,y)=>x-y);return(a[(a.length-1)>>1]+a[a.length>>1])/2;};
const fields=['whole_s','first_token_s','cold_prefill_s','handoff_ms','decode_tps','effective_output_tps','warm_native_s','tool_s','max_prompt_tokens','generated','evaluated','drafted','accepted','rounds'];
const groups=Object.fromEntries(['cpu','copy','share'].map(arm=>{const list=rows.filter(x=>x.arm===arm);return[arm,{n:list.length,workflow_passes:list.filter(x=>x.success).length,completed_milestones:list.map(x=>x.completed_phases),stats:list.length?Object.fromEntries(fields.map(k=>{const values=list.map(x=>x[k]);return[k,{median:med(values),min:Math.min(...values),max:Math.max(...values),values}];})):null}];}));
const sameWork=(a:any,b:any)=>a.raw_hash===b.raw_hash&&a.source_hash===b.source_hash&&JSON.stringify(a.prompts)===JSON.stringify(b.prompts)&&['generated','evaluated','drafted','accepted','rounds','completed_phases'].every(k=>a[k]===b[k]);
const comparisons=[['cpu','copy'],['cpu','share'],['copy','share']].map(([before,after])=>{
 const a=rows.filter(x=>x.arm===before),b=rows.filter(x=>x.arm===after),complete=a.length===2&&b.length===2,allPass=a.length>0&&b.length>0&&a.concat(b).every(x=>x.success),equal=a.length>0&&b.length>0&&a.concat(b).every(x=>sameWork(x,a[0]));
 const comparable=complete&&allPass&&equal;
 return{before,after,complete,all_tasks_pass:allPass,same_work:equal,comparable,changes:comparable?Object.fromEntries(['whole_s','decode_tps','first_token_s','effective_output_tps'].map(k=>[k,100*(groups[after].stats[k].median/groups[before].stats[k].median-1)])):null,reason:!allPass?'Task failure; no successful-task speedup':!equal?'Output/tool/work differs; descriptive task times only':!complete?'Incomplete balanced matrix':'Two observations per arm; exploratory,not confidence interval'};
});
const summary={complete:rows.length===3&&['cpu','copy','share'].every(a=>rows.some(r=>r.arm===a)),balanced_matrix_complete:rows.length===6,scope:'First-pass three-arm diagnostic; reverse repetitions cancelled after task failures',rows,groups,comparisons,failed_first_protocol:'../xe-long-agentic-20260914/runs/long-cpu-0',note:'CPU-only vs GPU-prefill/copiedKV vs GPU-prefill/sharedKV;Q6/MTP and task heldconstant,32Kcapacity not populated claim;weighted decode excludes first token of each response and tool time.'};
writeFileSync(root+'/summary.json',JSON.stringify(summary,null,2)+'\n');
const csvFields=['id','arm','success','failure','completed_phases',...fields,'shared_bytes','copied_bytes','memory_peak_bytes'];writeFileSync(root+'/results.csv',csvFields.join(',')+'\n'+rows.map(r=>csvFields.map(k=>JSON.stringify(r[k]??null)).join(',')).join('\n')+'\n');
console.log(JSON.stringify({complete:summary.complete,groups,comparisons},null,2));
