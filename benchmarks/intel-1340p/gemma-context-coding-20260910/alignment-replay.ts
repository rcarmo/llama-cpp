/** SCRIPT_JDOC:
{"summary":"Restore retained converted GPU state into original CPU binary; no repeated GPU prefill","kind":"mixed","weight":"heavy","role":"entrypoint"}
*/
import{Trial,root,save}from'./campaign';import{mkdirSync,copyFileSync}from'node:fs';
const t=new Trial('aligned-baseline-replay',{maintenance:true,build:'baseline',format:'f16',fa:false,full:false,ctx:262144,parallel:2,cache:256});let result:any={};
try{await t.begin();await t.start('cpu');const prior=root+'/runs/compact4-hybrid-baseline-r1',fixture=await Bun.file(prior+'/fixture.json').json();mkdirSync(t.dir+'/slots',{recursive:true});copyFileSync(prior+'/slots/compact-v2-validated.slot',t.dir+'/slots/converted.slot');
 await t.req('cpu','restore',{filename:'converted.slot'},'/slots/0?action=restore');const body={...fixture.body,id_slot:0};const r=await t.req('cpu','decode',body),m=r.choices[0].message;const append=await t.req('cpu','append',{...body,messages:[...body.messages,m,{role:'user',content:'Return the START key only.'}]});
 result={ok:true,answer:m.content,pass:m.content.includes('CEDAR-481')&&m.content.includes('BIRCH-953'),append:append.choices[0].message.content,append_pass:append.choices[0].message.content.includes('CEDAR-481'),cache_n:r.timings.cache_n,prompt_n:r.timings.prompt_n,append_cache_n:append.timings.cache_n,append_prompt_n:append.timings.prompt_n};
 if(!result.pass||!result.append_pass||result.cache_n<fixture.tokens.length-2||result.prompt_n>2)throw Error('Aligned restoration gate');
}catch(e){t.error ||=String(e);console.error(e)}finally{const r=await t.finish(result);if(!r.ok)process.exitCode=1}
