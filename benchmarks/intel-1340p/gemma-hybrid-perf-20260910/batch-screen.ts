/** SCRIPT_JDOC:
{"summary":"Screen FA-off Vulkan microbatch throughput at retained64K context with unchanged state layout","kind":"mixed","weight":"heavy","role":"entrypoint"}
*/
import{Trial,root,save}from'./campaign';import{copyFileSync}from'node:fs';
const ub=Number(process.argv[2]),order=process.argv[3];if(![128,256,512,1024].includes(ub))throw Error('microbatch');
if(order!==undefined&&!/^[0-7]$/.test(order))throw Error('order');
const t=new Trial(order===undefined?'batch64-'+ub:`confirm64-${order}-${ub}`,{maintenance:true,format:'f16',fa:false,full:false,ctx:147456,parallel:2,cache:0,ubatch:ub,batch:1024,vulkanBuild:'/var/home/agent/workspace/reports/gemma-context-coding-20260910/runtime-vulkan',preserveSwaPadding:true});let result:any={};
try{await t.begin();await t.start('vulkan');copyFileSync('/var/home/agent/workspace/reports/gemma-context-coding-20260910/runs/compact64-aligned/slots/long64.slot',t.dir+'/slots/state.slot');const f=await Bun.file(root+'/runs/vulkan64-tail-profile/fixture.json').json(),rows=[];
 for(let i=0;i<(order===undefined?2:1);i++){await t.req('vulkan','restore-'+i,{filename:'state.slot'},'/slots/0?action=restore');const r=await t.req('vulkan','tail-'+i,{prompt:f.prompt,n_predict:32,temperature:0,top_k:1,cache_prompt:true,id_slot:0});const row={rep:i,answer:r.content,pass:['CEDAR-481','MAPLE-726','BIRCH-953'].every(x=>r.content.includes(x)),timings:r.timings};rows.push(row);result={ok:true,ubatch:ub,rows,limits:order===undefined?'Two sequential screen requests, saved64K state reused; finalist needs counterbalanced repeats and fresh long prefill quality.':'One request in ABBA/BAAB block, saved64K state reused; native answer and cache checked. Does not measure full fresh prefill.'};if(!row.pass||r.timings.cache_n<64500||r.timings.prompt_n>2000)throw Error('Batch quality/coverage');}
}catch(e){t.error ||=String(e);console.error(e)}finally{const r=await t.finish(result);if(!r.ok)process.exitCode=1}
