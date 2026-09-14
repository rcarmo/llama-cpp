/** SCRIPT_JDOC:
{"summary":"Screen original-CPU64K decode using retained aligned state, bounded thread/MTP candidates","kind":"mixed","weight":"heavy","role":"entrypoint"}
*/
import{Trial,root,save,api}from'./campaign';import{copyFileSync,readFileSync,readdirSync}from'node:fs';
const name=process.argv[2];const profiles:any={base:{},p4:{decodeThreads:4,decodeMask:'55'},all16:{decodeThreads:16,decodeMask:'ffff'},omp8:{extraEnv:{OMP_NUM_THREADS:'8',OMP_PROC_BIND:'true',OMP_PLACES:'{0},{1},{2},{3},{4},{5},{6},{7}'}},mtp1:{draftMax:1},mtp5:{draftMax:5}};if(!profiles[name])throw Error('Unknown profile');
const t=new Trial('decode64-'+name,{maintenance:true,build:'baseline',format:'f16',fa:false,full:false,cpuCtx:262144,parallel:2,cache:0,...profiles[name]});let result:any={};
try{
 await t.begin();const server=await t.start('cpu');const origin='/var/home/agent/workspace/reports/gemma-context-coding-20260910/runs/compact64-aligned';copyFileSync(origin+'/slots/long64-v2.slot',t.dir+'/slots/state.slot');const f=JSON.parse(readFileSync(origin+'/fixture.json','utf8'));
 const body=structuredClone(f.body);body.messages[1].content+='\nAfter the three keys, count from1 to40 with each number on a new line.';
 const rendered=await api('http://127.0.0.1:18792/apply-template',body),prompt=(await api('http://127.0.0.1:18792/tokenize',{content:rendered.prompt,add_special:true,parse_special:true})).tokens,rows=[];
 save(t.dir+'/fixture.json',{body,prompt});
 for(let rep=0;rep<2;rep++){
  await t.req('cpu','restore-'+rep,{filename:'state.slot'},'/slots/0?action=restore');
  const r=await t.req('cpu','decode-'+rep,{prompt,n_predict:128,temperature:0,top_k:1,seed:42,cache_prompt:true,id_slot:0,return_tokens:true});
  const pass=['CEDAR-481','MAPLE-726','BIRCH-953'].every(x=>r.content.includes(x));rows.push({rep,pass,content:r.content,timings:r.timings});
  if(!pass||r.timings.cache_n<f.tokens.length-128||r.timings.prompt_n>200)throw Error('Recall/coverage gate');
 }
 const threads=readdirSync('/proc/'+server.p.pid+'/task').map(tid=>{const s=readFileSync(`/proc/${server.p.pid}/task/${tid}/status`,'utf8');return{tid,allowed:s.match(/^Cpus_allowed_list:\s*(.*)$/m)?.[1]}});save(t.dir+'/threads.json',threads);
 result={ok:true,name,rows,limits:'Two128-output-token sequential screen requests from identical retained64K state; not a repeated coding workflow or final promotion. Qualitative list formatting may vary; recall and cache coverage hard checks.'};
}catch(e){t.error ||=String(e);console.error(e)}finally{const r=await t.finish(result);if(!r.ok)process.exitCode=1}
