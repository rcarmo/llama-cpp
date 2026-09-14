/** SCRIPT_JDOC:
{"summary":"Screen64K tail attention FA on/off from same retained state with validated layout conversion","kind":"mixed","weight":"heavy","role":"entrypoint"}
*/
import{Trial,root,api,save}from'./campaign';import{convertLayout}from'./state-layout';import{convertGemmaV3ToV2}from'../gemma-context-coding-20260910/gemma-state-v2';import{copyFileSync}from'node:fs';
const which=process.argv[2];if(!['off','on'].includes(which))throw Error('on/off');const fa=which==='on';
const t=new Trial('attention64-'+which,{maintenance:true,format:'f16',fa,full:false,ctx:147456,parallel:2,cache:0,build:'baseline',vulkanBuild:'/var/home/agent/workspace/reports/gemma-context-coding-20260910/runtime-vulkan',preserveSwaPadding:true});let result:any={};
try{await t.begin();const orig='/var/home/agent/workspace/reports/gemma-context-coding-20260910/runs/compact64-aligned',state=root+'/attention64-'+which+'.slot';
 if(fa){save(t.dir+'/layout.json',convertLayout(orig+'/slots/long64.slot',state,1));const back=state+'.roundtrip';convertLayout(state,back,0);const [a,b]=await Promise.all([Bun.file(orig+'/slots/long64.slot').arrayBuffer(),Bun.file(back).arrayBuffer()]);if(!Buffer.from(a).equals(Buffer.from(b)))throw Error('Native64K layout roundtrip bytes mismatch');}
 else copyFileSync(orig+'/slots/long64.slot',state);
 await t.start('vulkan');copyFileSync(state,t.dir+'/slots/state.slot');const f=await Bun.file(root+'/runs/vulkan64-tail-profile/fixture.json').json();const rows=[];
 for(let i=0;i<2;i++){
  await t.req('vulkan','restore-'+i,{filename:'state.slot'},'/slots/0?action=restore');const r=await t.req('vulkan','tail-'+i,{prompt:f.prompt,n_predict:32,temperature:0,top_k:1,cache_prompt:true,id_slot:0});
  rows.push({rep:i,timings:r.timings,answer:r.content,pass:['CEDAR-481','MAPLE-726','BIRCH-953'].every(x=>r.content.includes(x))});
  if(r.timings.cache_n<64500||r.timings.prompt_n>2000||!rows[i].pass)throw Error('Tail correctness/coverage');
 }
 result={ok:true,fa,rows,limits:'Two unprofiled tail requests from identical retained FA-off64K state, lossless V transpose only. Not a fresh full64K FA prefill speedup or final quality gate.'};
 if(fa){
  await t.req('vulkan','save',{filename:'after-fa.slot'},'/slots/0?action=save');const off=t.dir+'/slots/after-off.slot';save(t.dir+'/back-layout.json',convertLayout(t.dir+'/slots/after-fa.slot',off,0));save(t.dir+'/back-v2.json',convertGemmaV3ToV2(off,t.dir+'/slots/after-v2.slot'));
  await t.stop('vulkan');t.cfg.fa=false;t.cfg.cpuCtx=262144;await t.start('cpu');await t.req('cpu','restore-cpu',{filename:'after-v2.slot'},'/slots/0?action=restore');
  const r=await t.req('cpu','cpu-reuse',{prompt:f.prompt,n_predict:32,temperature:0,cache_prompt:true,id_slot:0});result.cpu={answer:r.content,timings:r.timings,pass:['CEDAR-481','MAPLE-726','BIRCH-953'].every(x=>r.content.includes(x))};if(!result.cpu.pass||r.timings.cache_n<64500)throw Error('FA->CPU handoff gate');
 }
}catch(e){t.error ||=String(e);console.error(e)}finally{const r=await t.finish(result);if(!r.ok)process.exitCode=1}
