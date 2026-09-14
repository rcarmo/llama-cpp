/** SCRIPT_JDOC:
{"summary":"Guarded CPU-only FA-on/off decode tests from exact retained4K/64K GPU state","kind":"mixed","weight":"heavy","role":"entrypoint"}
*/
import{Trial,root,save}from'./campaign';import{convertLayout,convertGemmaV3ToV2,validateGemmaState}from'./state-layout';import{copyFileSync,mkdirSync}from'node:fs';
const mode=process.argv[2],profile=process.argv[3]??'on';if(!['smoke4','screen64','confirm64'].includes(mode)||!['off','on','on-target','on-f32','on-f32-target','on-patched-default','on-small','on-active','on-fused'].includes(profile))throw Error('mode/profile');const fa=profile!=='off',mtp=!profile.endsWith('target'),patched=profile.includes('f32')||profile==='on-patched-default'||(profile==='on-small'||profile==='on-active'||profile==='on-fused'),order=process.argv[4];if(mode==='confirm64'&&!/^[0-7]$/.test(order??''))throw Error('order');
const t=new Trial(`${mode}-${profile}${order?'-'+order:''}`,{maintenance:true,build:'baseline',format:'f16',fa,full:false,cpuCtx:262144,parallel:2,cache:0,mtp,cpuBuild:patched?root+'/runtime-cpu':undefined,extraEnv:profile.includes('f32')?{GGML_CPU_EXPERIMENTAL_FA_F32_VALUE:'1'}:profile==='on-small'?{GGML_CPU_EXPERIMENTAL_FA_SMALL_QUERY:'1'}:profile==='on-active'?{GGML_CPU_EXPERIMENTAL_FA_SMALL_QUERY:'1',GGML_CPU_EXPERIMENTAL_FA_ACTIVE_ROWS:'1'}:profile==='on-fused'?{GGML_CPU_EXPERIMENTAL_FA_FUSED_VALUE:'1'}:{}});let result:any={};
try{
 await t.begin();const small=mode==='smoke4';
 if(!small){const gate=await Bun.file(root+'/runs/smoke4-on/result.json').json();if(!gate.ok||!gate.pass||!gate.append_pass)throw Error('4K FA gate');}
 const prev='/var/home/agent/workspace/reports/gemma-context-coding-20260910',src=small?prev+'/runs/compact4-hybrid-baseline-r1/slots/compact.slot':prev+'/runs/compact64-aligned/slots/long64.slot';
 mkdirSync(t.dir+'/slots',{recursive:true});const v3=t.dir+'/slots/native-v3.slot',v2=t.dir+'/slots/cpu-v2.slot';
 // New experiment files only; reuse previous exact64K transpose where available.
 if(fa&&!small)copyFileSync('/var/home/agent/workspace/reports/gemma-hybrid-perf-20260910/attention64-on.slot',v3);
 else if(fa)save(t.dir+'/transpose.json',convertLayout(src,v3,1));else copyFileSync(src,v3);
 const start=performance.now();save(t.dir+'/alignment.json',convertGemmaV3ToV2(v3,v2,2,fa?0:1));const conversion_ms=performance.now()-start;
 await t.start('cpu');
 const f=await Bun.file(small?prev+'/runs/compact4-hybrid-baseline-r1/fixture.json':'/var/home/agent/workspace/reports/gemma-hybrid-perf-20260910/runs/decode64-base/fixture.json').json();
 const rows=[];for(let rep=0;rep<(mode==='screen64'?2:1);rep++){
  await t.req('cpu','restore-'+rep,{filename:'cpu-v2.slot'},'/slots/0?action=restore');
  const body=small?{...f.body,id_slot:0}:{prompt:f.prompt,n_predict:128,temperature:0,top_k:1,seed:42,cache_prompt:true,id_slot:0,return_tokens:true};
  const r=await t.req('cpu','decode-'+rep,body),content=small?r.choices[0].message.content:r.content;const keys=small?['CEDAR-481','BIRCH-953']:['CEDAR-481','MAPLE-726','BIRCH-953'];
  rows.push({rep,content,pass:keys.every(k=>content.includes(k)),timings:r.timings});result={ok:true,profile,fa,mtp,conversion_ms,rows,pass:rows.every(x=>x.pass)};
  if(!rows[rep].pass||r.timings.cache_n<(small?4347:64658)||r.timings.prompt_n!==(small?1:25))throw Error('CPU FA task/coverage gate');
  if(small){const a=await t.req('cpu','append',{...f.body,messages:[...f.body.messages,r.choices[0].message,{role:'user',content:'Return the START key only.'}],id_slot:0});result.append_pass=a.choices[0].message.content.includes('CEDAR-481');result.append=a.choices[0].message.content;result.append_cache_n=a.timings.cache_n;result.append_prompt_n=a.timings.prompt_n;if(!result.append_pass||a.timings.cache_n<4360)throw Error('Append gate')}
 }
 result.scope='CPU FA-on/off on retained binary; same native GPU-FA-off source KV with exact F16 layout conversion. No GPU inference here. Nonpredict timing includes only request; conversion/startup/restore separate. Screen results require counterbalanced confirmation.';
}catch(e){t.error ||=String(e);console.error(e)}finally{const r=await t.finish(result);if(!r.ok)process.exitCode=1}
