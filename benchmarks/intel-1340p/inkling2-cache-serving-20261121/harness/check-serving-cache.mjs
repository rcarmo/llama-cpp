import fs from 'node:fs';
const run='/var/home/agent/workspace/tmp/llama-cpp/runs/inkling-cache-serving-20261121-1dadee62b';
import { createHash } from 'node:crypto';
const label=process.argv[2];
if(!/^[a-z0-9-]+$/.test(label||''))throw Error('label');
const base='http://192.168.1.70:11434';
const assert=(ok,msg)=>{if(!ok)throw Error(msg)};
const save=(name,j)=>fs.writeFileSync(`${run}/${label}.${name}.json`,JSON.stringify(j,null,2)+'\n');
async function call(path,body){const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(300000)});const j=await r.json();assert(r.ok,JSON.stringify(j));return j;}
const fixture='// Stable deduplication.\nfunction uniqueStable(items) { const seen = new Set(); return items.filter(item => { if (seen.has(item)) return false; seen.add(item); return true; }); }\nconst input = [3, 1, 3, 2, 1]; const expected = [3, 1, 2];\nconsole.assert(JSON.stringify(uniqueStable(input)) === JSON.stringify(expected));\n';
const tok=await call('/tokenize',{content:fixture.repeat(80),add_special:false});
assert(tok.tokens.length>2048,'fixture');
const shared=(await call('/detokenize',{tokens:tok.tokens.slice(0,1792)})).content;
const tail=(await call('/detokenize',{tokens:tok.tokens.slice(1792,2048)})).content;
const system={role:'system',content:'Treat the supplied code as context. Follow the final instruction. Return only READY, without punctuation or explanation.'};
const original=[system,{role:'user',content:shared+tail+'\nReturn only READY.'}];
const edited=[system,{role:'user',content:shared+'\n// Revised tail: use a Set and preserve input order.\n'.repeat(24)+'\nReturn only READY.'}];
const results=[];
async function chat(name,messages){
 const rendered=await call('/apply-template',{messages,add_generation_prompt:true});
 save(name+'-rendered',{...rendered,sha256:createHash('sha256').update(rendered.prompt??JSON.stringify(rendered)).digest('hex')});
 const start=performance.now();
 const j=await call('/v1/chat/completions',{model:'Inkling-2-Mini',messages,temperature:0,cache_prompt:true});
 const wall_ms=performance.now()-start;
 save(name,j);
 const choice=j.choices?.[0];assert(choice?.finish_reason==='stop',`${name} no EOG`);
 assert(choice.message.content?.trim()==='READY',`${name} unexpected answer`);
 const row={name,wall_ms,timings:j.timings,usage:j.usage,naturalEOG:true,outputCap:false};results.push(row);console.log(JSON.stringify(row));
 return choice.message;
}
await chat('cold',original);
await chat('displace',[{role:'user',content:'Return only READY, without punctuation or explanation.'}]);
await chat('revisit',original);
const longAppendReused=results[2].timings?.cache_n>1000;
assert(longAppendReused,'Live long-revisit cache not reused');
save('revisit-reuse',{passed:longAppendReused,cache_n:results[2].timings?.cache_n});
const ctl=new AbortController();
const response=await fetch(base+'/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json'},signal:ctl.signal,body:JSON.stringify({model:'Inkling-2-Mini',stream:true,messages:[{role:'user',content:'Explain how to build a compiler in extensive detail, including parsing and type inference.'}]})});
assert(response.ok,'cancel stream status');const reader=response.body.getReader();let raw='',seen=false;
while(!seen){const item=await reader.read();assert(!item.done,'no cancellation delta');raw+=new TextDecoder().decode(item.value);for(const line of raw.split('\n')){if(!line.startsWith('data: ')||line==='data: [DONE]')continue;try{const d=JSON.parse(line.slice(6)).choices?.[0]?.delta;seen=!!(d?.content||d?.reasoning_content)||seen;}catch{}}}
ctl.abort();let idle=false;for(let i=0;i<60;i++){const slots=await(await fetch(base+'/slots')).json();if(slots.every(x=>!x.is_processing)){idle=true;break;}await Bun.sleep(500);}assert(idle,'cancel drain');
await chat('recovery',[{role:'user',content:'Return only READY, without punctuation or explanation.'}]);
save('cancellation',{afterActualDelta:true,idle:true,recovery:'READY'});
save('warm-results',{label,requestOutputCaps:false,sharedContentTokens:2048,results});
console.log('PASS uncapped cold/displace/revisit/cancel/recovery; longRevisitReused='+longAppendReused);
