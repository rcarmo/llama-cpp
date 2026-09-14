/** SCRIPT_JDOC:
{"summary":"Profile bounded Vulkan prefill continuation from finite64K compact saved state","kind":"mixed","weight":"heavy","role":"entrypoint"}
*/
import{Trial,root,api,save}from'./campaign';import{copyFileSync}from'node:fs';
const t=new Trial('vulkan64-tail-profile',{maintenance:true,format:'f16',fa:false,full:false,ctx:147456,parallel:2,cache:0,vulkanBuild:'/var/home/agent/workspace/reports/gemma-context-coding-20260910/runtime-vulkan',preserveSwaPadding:true,perfVulkan:true});let result:any={};
try{await t.begin();await t.start('vulkan');const origin='/var/home/agent/workspace/reports/gemma-context-coding-20260910/runs/compact64-aligned';copyFileSync(origin+'/slots/long64.slot',t.dir+'/slots/state.slot');const f=await Bun.file(origin+'/fixture.json').json();
 const body=structuredClone(f.body);body.messages[1].content+='\n'+Array.from({length:60},(_,i)=>`Additional ${i}: retain the original three keys, ignore neutral extra records.`).join('\n')+'\nReturn the three keys only.';
 const rendered=await api('http://127.0.0.1:18791/apply-template',body),prompt=(await api('http://127.0.0.1:18791/tokenize',{content:rendered.prompt,add_special:true,parse_special:true})).tokens;save(t.dir+'/fixture.json',{body,prompt});
 await t.req('vulkan','restore',{filename:'state.slot'},'/slots/0?action=restore');
 const r=await t.req('vulkan','profile-tail',{prompt,n_predict:1,temperature:0,cache_prompt:true,id_slot:0});
 if(r.timings.cache_n<f.tokens.length-128||r.timings.prompt_n>2000)throw Error('Profile coverage lost');result={ok:true,timings:r.timings,limits:'Instrumented serialized dispatch timings are diagnostic only; no performance claims from profiler wall time. Saved finite64K state reused, no full prompt rerun.'};
}catch(e){t.error ||=String(e);console.error(e)}finally{const r=await t.finish(result);if(!r.ok)process.exitCode=1}
