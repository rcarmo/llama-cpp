/** SCRIPT_JDOC:
{"summary":"Compact-SWA64K GPU-prefill to CPU/MTP recall with finite state and append checks","kind":"mixed","weight":"heavy","role":"entrypoint"}
*/
import{Trial,root,api,save}from'./campaign';import{convertGemmaV3ToV2}from'./gemma-state-v2';
const t=new Trial('compact64-aligned',{maintenance:true,format:'f16',fa:false,full:false,ctx:147456,cpuCtx:262144,parallel:2,cache:256,build:'baseline',vulkanBuild:root+'/runtime-vulkan',preserveSwaPadding:true});let result:any={};
try{
 const aligned=await Bun.file(root+'/runs/aligned-baseline-replay/result.json').json();if(!aligned.ok||aligned.prompt_n>2)throw Error('Aligned CPU gate');
 for(const mode of ['cpu-on','hybrid-on']){const gate=await Bun.file(root+`/runs/compact4-${mode}-r1/result.json`).json();if(!gate.ok||!gate.state_finite||gate.prompt_n>2||!gate.pass||!gate.append_pass)throw Error('4K gate incomplete');}
 await t.begin();await t.start('cpu');await t.start('vulkan');
 const codes=['CEDAR-481','MAPLE-726','BIRCH-953'];const lines=Array.from({length:4800},(_,i)=>`Inventory reference ${i}: the grey containers hold ordinary spare components and scheduled records.`);
 const messages:any[]=[{role:'system',content:'Use only the provided reference records. Return the requested keys, with no invented facts.'},{role:'user',content:''}];
 const body={messages,temperature:0,top_k:1,seed:42,max_tokens:64,cache_prompt:true,chat_template_kwargs:{enable_thinking:false},id_slot:0};let tokens:number[]=[];
 for(let attempt=0;attempt<12;attempt++){
  const chosen=[...lines];chosen[0]=`Record START: the key is ${codes[0]}.`;chosen[Math.floor(chosen.length/2)]=`Record MIDDLE: the key is ${codes[1]}.`;chosen[chosen.length-1]=`Record END: the key is ${codes[2]}.`;
  messages[1].content=chosen.join('\n')+'\nReturn the keys for START, MIDDLE and END in that order, separated by commas.';
  const rendered=await api('http://127.0.0.1:18792/apply-template',body);tokens=(await api('http://127.0.0.1:18792/tokenize',{content:rendered.prompt,add_special:true,parse_special:true})).tokens;
  if(tokens.length>=64000&&tokens.length<=65536)break;
  const estimate=Math.round(lines.length*65000/tokens.length);if(estimate<lines.length)lines.splice(estimate);else for(let i=lines.length;i<estimate;i++)lines.push(`Inventory reference ${i}: the grey containers hold ordinary spare components and scheduled records.`);
 }
 if(tokens.length<64000||tokens.length>65536)throw Error('64K fixture bounds');save(t.dir+'/fixture.json',{body,tokens,expected:codes});
 const start=performance.now();await t.req('vulkan','prefill',{prompt:tokens.slice(0,-1),n_predict:1,temperature:0,cache_prompt:false,id_slot:0});
 const file='long64.slot',state=await t.req('vulkan','save',{filename:file},'/slots/0?action=save');const converted='long64-v2.slot';save(t.dir+'/conversion.json',convertGemmaV3ToV2(t.dir+'/slots/'+file,t.dir+'/slots/'+converted));await t.req('cpu','restore',{filename:converted},'/slots/0?action=restore');
 const first=await t.req('cpu','decode',body),answer=first.choices[0].message.content,total_ms=performance.now()-start;
 const append=await t.req('cpu','append',{...body,messages:[...messages,first.choices[0].message,{role:'user',content:'Return only the MIDDLE key.'}]});
 result={ok:true,actual_tokens:tokens.length,context_per_gpu_stream:73728,context_per_cpu_stream:131072,streams:2,total_ms,state_bytes:state.n_written,answer,pass:codes.every(x=>answer.includes(x)),append:append.choices[0].message.content,append_pass:append.choices[0].message.content.includes(codes[1]),cache_n:first.timings.cache_n,prompt_n:first.timings.prompt_n,append_cache_n:append.timings.cache_n,append_prompt_n:append.timings.prompt_n,limits:'One64K positional recall/append pair, not repeated speedup or full two128K service qualification. Startup excluded; save/restore included. Finite scan outside timed request.'};
 const p=Bun.spawn([process.execPath,root+'/inspect-slot.ts',t.dir+'/slots/'+file,t.dir+'/state-inspection.json'],{stdout:'ignore',stderr:'inherit'});if(await p.exited)throw Error('State scan failed');const scan=await Bun.file(t.dir+'/state-inspection.json').json();result.state_finite=scan.total_nan===0&&scan.total_inf===0;
 if(!result.state_finite||!result.pass||!result.append_pass||result.cache_n<tokens.length-2||result.prompt_n>2)throw Error('64K quality/state/coverage gate');
}catch(e){t.error ||= String(e);console.error(e)}finally{const r=await t.finish(result);if(!r.ok)process.exitCode=1}
