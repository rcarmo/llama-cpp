/** SCRIPT_JDOC:
{"summary":"Fresh64K prefill finalist:GPUubatch1024 bounded padded export into retained CPUubatch256","kind":"mixed","weight":"heavy","role":"entrypoint"}
*/
import{Trial,root,save}from'./campaign';import{convertGemmaV3ToV2}from'../gemma-context-coding-20260910/gemma-state-v2';
const t=new Trial('full64-1024',{maintenance:true,build:'baseline',format:'f16',fa:false,full:false,ctx:147456,cpuCtx:262144,parallel:2,cache:256,vulkanBuild:root+'/runtime-vulkan',preserveSwaPadding:true});let result:any={};
try{const cap=await Bun.file(root+'/runs/cap4-1024/result.json').json();if(!cap.ok||!cap.state_finite||cap.prompt_n!==1)throw Error('4Kcap gate');await t.begin();await t.start('cpu');t.cfg.ubatch=1024;t.cfg.batch=1024;await t.start('vulkan');
 const f=await Bun.file('/var/home/agent/workspace/reports/gemma-context-coding-20260910/runs/compact64-aligned/fixture.json').json();save(t.dir+'/fixture.json',f);const start=performance.now();
 await t.req('vulkan','prefill',{prompt:f.tokens.slice(0,-1),n_predict:1,temperature:0,cache_prompt:false,id_slot:0});const saved=await t.req('vulkan','save',{filename:'state.slot'},'/slots/0?action=save');
 save(t.dir+'/conversion.json',convertGemmaV3ToV2(t.dir+'/slots/state.slot',t.dir+'/slots/state-v2.slot'));await t.req('cpu','restore',{filename:'state-v2.slot'},'/slots/0?action=restore');
 const r=await t.req('cpu','decode',f.body),answer=r.choices[0].message.content,total=performance.now()-start;
 const a=await t.req('cpu','append',{...f.body,messages:[...f.body.messages,r.choices[0].message,{role:'user',content:'Return only the MIDDLE key.'}]});
 result={ok:true,actual_tokens:f.tokens.length,total_ms:total,state_bytes:saved.n_written,answer,pass:['CEDAR-481','MAPLE-726','BIRCH-953'].every(x=>answer.includes(x)),cache_n:r.timings.cache_n,prompt_n:r.timings.prompt_n,append:a.choices[0].message.content,append_pass:a.choices[0].message.content.includes('MAPLE-726'),append_cache_n:a.timings.cache_n,append_prompt_n:a.timings.prompt_n,limits:'Fresh64K finalist compared with retained earlier single full64K control; not a balanced fresh64K series. Repeated counterbalanced evidence is from64K tail. Same warm GPU residency as earlier full64K run.'};
 const p=Bun.spawn([process.execPath,root+'/inspect-slot.ts',t.dir+'/slots/state.slot',t.dir+'/state-inspection.json'],{stdout:'ignore',stderr:'inherit'});if(await p.exited)throw Error('Scan');const scan=await Bun.file(t.dir+'/state-inspection.json').json();result.state_finite=scan.total_nan===0&&scan.total_inf===0;result.swa_max_cells=Math.max(...scan.layers.filter(l=>l.cache===1).map(l=>l.cells));
 if(!result.pass||!result.append_pass||!result.state_finite||result.prompt_n!==1||result.swa_max_cells>768)throw Error('Full64K finalist gate');
}catch(e){t.error ||=String(e);console.error(e)}finally{const r=await t.finish(result);if(!r.ok)process.exitCode=1}
