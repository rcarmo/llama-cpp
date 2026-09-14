/** SCRIPT_JDOC:
{"summary":"Audit shape-resolved64KCPUdiagnostics without conflating packingthreadtime and nodewall","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import {readFileSync,writeFileSync} from 'node:fs';
export function parse(log:string){return log.split('\n').filter(l=>l.startsWith('GGML_CPU_SHAPE_PROFILE ')).map(l=>Object.fromEntries([...l.matchAll(/(\w+)=([^\s]+)/g)].map(m=>[m[1],/^\d+$/.test(m[2])?Number(m[2]):m[2]])));}
export function audit(root:string){
 const read=(p:string)=>JSON.parse(readFileSync(root+'/'+p,'utf8')),assert=(v:unknown,s:string)=>{if(!v)throw Error(s)},kv=(l:string)=>Object.fromEntries([...l.matchAll(/(\w+)=([^\s]+)/g)].map(m=>[m[1],/^\d+$/.test(m[2])?Number(m[2]):m[2]]));
 const runs=['mtp3','target'].map(mode=>{
  const dir='runs/shapes64-'+mode,r=read(dir+'/result.json'),log=readFileSync(root+'/'+dir+'/cpu.log','utf8');
  assert(r.ok&&r.pass&&r.timings.cache_n===64658&&r.timings.prompt_n===25&&r.timings.predicted_n===128,'Diagnostic workload');
  assert(r.resources.peak_trial_swap_kib===0&&r.resources.min_available_kib>=6*1048576,'Resource envelope');
  const rows=parse(log),summary=rows.find(x=>x.phase==='summary');assert(summary&&summary.overflow===0&&summary.groups===rows.length-1,'Boundedshapecoverage');
  const native=log.split('\n').filter(l=>l.startsWith('GGML_CPU_WHOLE_TOKEN_PROFILE ')).map(kv),total=native.find(x=>x.kind==='total')!,matrix=native.find(x=>x.kind==='family'&&x.name==='matrix')!;
  const nodes=rows.filter(x=>x.phase==='node_wall');assert(nodes.reduce((n,x)=>n+Number(x.elapsed_us),0)===matrix.wall_us,'Shape/node matrix reconciliation');
  const categories:any={},packing:any={};
  for(const x of nodes){const kind=x.at==='f16'?(String(x.name).startsWith('kqv-')?'f16_value':String(x.name).startsWith('kq-')?'f16_score':'f16_other'):String(x.at)+'_projection';const key=kind+' '+(Number(x.n)<=4?'small':'prompt_tail');const g=categories[key]??={calls:0,wall_us:0};g.calls+=Number(x.calls);g.wall_us+=Number(x.elapsed_us);}
  for(const x of rows.filter(x=>String(x.phase).includes('pack_thread'))){const key=x.phase+' '+x.at,g=packing[key]??={thread_calls:0,thread_elapsed_us:0};g.thread_calls+=Number(x.calls);g.thread_elapsed_us+=Number(x.elapsed_us);}
  for(const v of Object.values(categories)as any[])v.node_wall_pct=100*v.wall_us/Number(total.node_wall_us);
  return{mode,profile_rows:rows,summary,total,matrix,categories,packing_thread_sums:packing,top_node_groups:nodes.sort((a,b)=>Number(b.elapsed_us)-Number(a.elapsed_us)).slice(0,20),resources:r.resources,thermal:r.thermal,timings_diagnostic:r.timings};
 });
 const restored=read('restoration-check.json');assert(restored.pass&&restored.swap_kib===0,'Currentproductionrestored');
 return{audit_pass:true,runs,restoration:{pass:true,info:restored.info,verified_at:restored.verified_at},limits:['Instrumentedwallincludesbarriers;packingthreadtimeisall-threadsum,notrequestwall','Matrixfamilyincludesattention;onlymodeltensormetadatarecorded','25prompttail+128decodepermode,notpuregenerationops-only','Bounded8192entries;overflow0required','No candidate/no production change; nextoptimization requires uninstrumentedcomparison']};
}
if(import.meta.main){const r=audit(import.meta.dir);writeFileSync(import.meta.dir+'/results.json',JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({audit_pass:r.audit_pass,runs:r.runs.map(x=>({mode:x.mode,summary:x.summary,total:x.total,categories:x.categories,packing:x.packing_thread_sums})),restoration:r.restoration},null,2))}
