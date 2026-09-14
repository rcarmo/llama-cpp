/** SCRIPT_JDOC:
{"summary":"Guarded compact-SWA padding save/restore controls and GPU-to-CPU MTP smoke","kind":"mixed","weight":"heavy","role":"entrypoint"}
*/
import {convertGemmaV3ToV2} from './gemma-state-v2';
import {Trial,root,api,save} from './campaign';
const which=process.argv[2];if(!['cpu-off','cpu-on','hybrid-on','hybrid-baseline'].includes(which))throw Error('Expected cpu-off|cpu-on|hybrid-on');
const hybrid=which.startsWith('hybrid-'),padding=which!=='cpu-off',baseline=which==='hybrid-baseline';
const t=new Trial('compact4-'+which+(process.env.PROBE_SUFFIX??''),{maintenance:true,format:'f16',fa:false,full:false,ctx:baseline?147456:16384,cpuCtx:baseline?262144:16384,parallel:baseline?2:1,cache:0,build:baseline?'baseline':'build-cpu',cpuBuild:baseline?undefined:root+'/runtime-cpu',vulkanBuild:root+'/runtime-vulkan',preserveSwaPadding:padding});let result:any={};
try{
 await t.begin();await t.start('cpu');if(hybrid)await t.start('vulkan');
 const messages=[{role:'user',content:'START key: CEDAR-481.\n'+Array.from({length:260},(_,i)=>`Record ${i}: neutral padding carries no key; retain exact identifiers.`).join('\n')+'\nEND key: BIRCH-953. Return the START and END keys only.'}];
 const body={messages,temperature:0,top_k:1,seed:42,max_tokens:32,cache_prompt:true,chat_template_kwargs:{enable_thinking:false}};
 const rendered=await api('http://127.0.0.1:18792/apply-template',body),tokens=(await api('http://127.0.0.1:18792/tokenize',{content:rendered.prompt,add_special:true,parse_special:true})).tokens;
 save(t.dir+'/fixture.json',{body,tokens});
 const device=hybrid?'vulkan':'cpu';
 await t.req(device,'prefill',{prompt:tokens.slice(0,-1),n_predict:1,temperature:0,cache_prompt:false,id_slot:0,return_tokens:true});
 const file='compact.slot',saved=await t.req(device,'save',{filename:file},'/slots/0?action=save');
 if(!hybrid){const native=await t.req('cpu','native',{...body,id_slot:0});result.native=native.choices[0].message.content;await t.req('cpu','erase',{},'/slots/0?action=erase')}
 let restoreFile=file;
 if(baseline){restoreFile='compact-v2.slot';const converted=convertGemmaV3ToV2(t.dir+'/slots/'+file,t.dir+'/slots/'+restoreFile,2);save(t.dir+'/conversion.json',converted)}
 await t.req('cpu','restore',{filename:restoreFile},'/slots/0?action=restore');
 const decoded=await t.req('cpu','decode',{...body,id_slot:0}),answer=decoded.choices[0].message.content;
 const appended=await t.req('cpu','append',{...body,messages:[...messages,decoded.choices[0].message,{role:'user',content:'Return the START key only.'}],id_slot:0});
 result={...result,ok:true,padding,hybrid,tokens:tokens.length,state_bytes:saved.n_written,answer,pass:answer.includes('CEDAR-481')&&answer.includes('BIRCH-953'),append:appended.choices[0].message.content,append_pass:appended.choices[0].message.content.includes('CEDAR-481'),cache_n:decoded.timings.cache_n,prompt_n:decoded.timings.prompt_n,append_cache_n:appended.timings.cache_n,append_prompt_n:appended.timings.prompt_n};
 if(!result.pass||!result.append_pass||(padding&&(result.cache_n<tokens.length-2||result.prompt_n>2)))throw Error('Compact transfer quality/coverage gate');
 const p=Bun.spawn([process.execPath,root+'/inspect-slot.ts',t.dir+'/slots/'+file,t.dir+'/state-inspection.json'],{stdout:'pipe',stderr:'pipe'});const out=await new Response(p.stdout).text();if(await p.exited)throw Error(await new Response(p.stderr).text());const scan=await Bun.file(t.dir+'/state-inspection.json').json();result.state_finite=scan.total_nan===0&&scan.total_inf===0;if(!result.state_finite)throw Error('Nonfinite state');
}catch(e){t.error ||= String(e);console.error(e)}finally{const r=await t.finish(result);if(!r.ok)process.exitCode=1}
