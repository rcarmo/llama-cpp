/** SCRIPT_JDOC:
{"summary":"Measure actual dual-slot B0CPU16K32K64K occupancy and real restored-prefix reuse","kind":"mixed","weight":"heavy","role":"entrypoint"}
*/
import{Trial,root,save}from'./campaign';import{mkdirSync,copyFileSync,readFileSync}from'node:fs';import{convertGemmaV3ToV2}from'./gemma-state-v2';import{capture}from'./capture';
const t=new Trial('dual-slot-capacity',{maintenance:true,build:'baseline',format:'f16',fa:false,full:false,cpuCtx:262144,parallel:2,cache:0,ubatch:256,batch:1024,cpuBuild:'/var/home/agent/workspace/reports/gemma-decode-score3-20260911/runtime-cpu',extraEnv:{LLAMA_EXPERIMENTAL_SMALL_TARGET_BATCH:'1',GGML_CPU_EXPERIMENTAL_ATTN4:'1',GGML_CPU_EXPERIMENTAL_SCORE4_3ROW:'1'}}),rows:any[]=[];
const source=JSON.parse(readFileSync('/var/home/agent/workspace/reports/gemma-context-coding-20260910/runs/compact64-aligned/fixture.json','utf8'));
function memory(pid:number){const s=readFileSync(`/proc/${pid}/status`,'utf8'),pss=readFileSync(`/proc/${pid}/smaps_rollup`,'utf8'),mem=readFileSync('/proc/meminfo','utf8');return{rss_kib:Number(s.match(/^VmRSS:\s+(\d+)/m)?.[1]),pss_kib:Number(pss.match(/^Pss:\s+(\d+)/m)?.[1]),swap_kib:Number(s.match(/^VmSwap:\s+(\d+)/m)?.[1]),available_kib:Number(mem.match(/^MemAvailable:\s+(\d+)/m)?.[1])};}
try{await t.begin();const cpu=await t.start('cpu');capture(t.dir,cpu.p.pid);save(t.dir+'/memory-empty.json',memory(cpu.p.pid));
for(const n of[16384,32768,64663]){await t.check();let filename=`prefix-${n}-v2.slot`;
 if(n===64663)copyFileSync('/var/home/agent/workspace/reports/gemma-context-coding-20260910/runs/compact64-aligned/slots/long64-v2.slot',t.dir+'/slots/'+filename);
 else{const src=`/var/home/agent/workspace/reports/gemma-prefill-crossover-20260911/runs/prefix-checkpoints-16-32-48/slots/prefix-${n}.slot`;const conversion=convertGemmaV3ToV2(src,t.dir+'/slots/'+filename);save(t.dir+`/conversion-${n}.json`,conversion);}
 for(const slot of[0,1])await t.req('cpu',`restore-${n}-slot${slot}`,{filename},`/slots/${slot}?action=restore`);
 const perSlot=[];for(const slot of[0,1,0]){const r=await t.req('cpu',`reuse-${n}-slot${slot}-${perSlot.length}`,{prompt:source.tokens.slice(0,n),n_predict:1,temperature:0,top_k:1,seed:42,cache_prompt:true,id_slot:slot});if(r.timings.prompt_n!==1||r.timings.cache_n!==n-1)throw Error('Actualcache/slotremap');perSlot.push({slot,cache:r.timings.cache_n,evaluated:r.timings.prompt_n,content:r.content});}
 const slots=await(await fetch('http://127.0.0.1:18792/slots')).json();if(slots.some(s=>s.is_processing)||slots.length!==2)throw Error('Slots');const m=memory(cpu.p.pid);if(m.swap_kib||m.available_kib<6*1048576)throw Error('Capacityresource');rows.push({tokens_per_slot:n,actual_slots:slots.map(s=>({id:s.id,n_ctx:s.n_ctx,n_prompt_tokens:s.n_prompt_tokens})),perSlot,memory:m});save(t.dir+'/capacity-progress.json',{rows});
}
}catch(e){t.error ||=String(e);console.error(e)}finally{const r=await t.finish({ok:!t.error,rows,scope:'NativeCPUtwoactualrestoredstates/remapping/oneevalreuse;cacheRAMdisabled for isolation,productioncapacitywith12GiBcache may differ;notdual128K'});if(!r.ok)process.exitCode=1}
