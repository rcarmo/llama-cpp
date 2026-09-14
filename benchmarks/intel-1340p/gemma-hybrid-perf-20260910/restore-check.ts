/** SCRIPT_JDOC:
{"summary":"Speech-guarded original-profile tool continuation diagnostic; no restarts or hybrid inference","kind":"mixed","weight":"standard","role":"entrypoint"}
*/
import {mkdirSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
const root=import.meta.dir,dir=join(root,'restoration-tool-smoke'),base='http://127.0.0.1:8091';
if(!process.argv.includes('--allow-live'))throw Error('Explicit --allow-live required');
mkdirSync(dir); // Never overwrite a completed or interrupted diagnostic.
const save=(n:string,v:any)=>writeFileSync(join(dir,n+'.json'),JSON.stringify(v,null,2)+'\n');
const text=(p:string)=>{try{return readFileSync(p,'utf8')}catch{return ''}};
const abort=new AbortController();let timer:any,busy=false,lastNative=new Map<number,number>(),failure='',calls=0;
async function get(url:string){const r=await fetch(url,{signal:AbortSignal.timeout(3000)});if(!r.ok)throw Error('Guard HTTP'+r.status);return r.json()}
async function guard(){
 const jobs=await get('http://127.0.0.1:8092/api/jobs');if(!Array.isArray(jobs)||jobs.some(j=>!['completed','failed','cancelled'].includes(j.state)))throw Error('Speech jobs active or unknown');
 const native=new Map<number,number>();for(const n of readdirSync('/proc'))if(/^\d+$/.test(n)){const comm=text(`/proc/${n}/comm`).trim();if(comm==='whisper-cli')throw Error('Speech CLI active');if(comm==='diar-server'){const stat=text(`/proc/${n}/stat`).replace(/^.*\) /,'').split(' '),ticks=Number(stat[11])+Number(stat[12]);native.set(+n,ticks);if(lastNative.has(+n)&&ticks-lastNative.get(+n)!>10)throw Error('Native speech work active')}}lastNative=native;
 const p=Bun.spawn(['ss','-tn','state','established','( sport = :8092 or sport = :8701 )'],{stdout:'pipe',stderr:'ignore'});const sockets=await new Response(p.stdout).text();if(await p.exited)throw Error('Speech socket guard unavailable');if(sockets.split('\n').slice(1).some(l=>Number(l.trim().split(/\s+/)[0])>0))throw Error('Speech receive queue active');
 if(Number(text('/proc/meminfo').match(/^MemAvailable:\s+(\d+)/m)?.[1]??0)<6291456)throw Error('Memory reserve');
 const status=text('/proc/589674/status');if(!status||Number(status.match(/^VmSwap:\s+(\d+)/m)?.[1]??Infinity)>16384)throw Error('Original provider identity/swap changed');
}
async function idle(){const slots=await get(base+'/slots');if(!Array.isArray(slots)||slots.length!==2||slots.some(s=>s.is_processing))throw Error('LLM slots busy or unknown')}
async function post(label:string,path:string,body:any){
 if(abort.signal.aborted)throw Error(failure||'Aborted');await guard();await idle();if(++calls>16)throw Error('Diagnostic call budget');
 const started=new Date().toISOString(),r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.any([abort.signal,AbortSignal.timeout(45000)]),timeout:false});const raw=await r.text();let response;try{response=JSON.parse(raw)}catch{response={raw}}save(label,{scope:'Original-profile labelled diagnostic, NOT promotion timing evidence',started,request:body,status:r.status,response});if(!r.ok)throw Error('Diagnostic HTTP'+r.status);return response;
}
const tools=[{type:'function',function:{name:'lookup_stock',description:'Read fixture inventory',parameters:{type:'object',properties:{sku:{type:'string'}},required:['sku'],additionalProperties:false}}}];
const original:any[]=[{role:'system',content:'Use the lookup_stock tool. Use only tool results. Follow exact output instructions.'},{role:'user',content:Array.from({length:20},(_,i)=>`Record${i}: maintain the supplied stock identifier and quantity unchanged.`).join('\n')+'\nLook up SKU PANDA-RESTORE.'}];
const oldCall={tool_calls:[{id:'unused',type:'function',function:{name:'lookup_stock',arguments:'{}'}}]};
const result={role:'tool',tool_call_id:oldCall.tool_calls[0].id,content:'{"quantity":23,"sku":"PANDA-RESTORE"}'};
const defaults={tools,temperature:0,seed:42,max_tokens:96,cache_prompt:false,chat_template_kwargs:{enable_thinking:false}};
const rows:any[]=[];
try{
 await guard();await Bun.sleep(1200);await guard();await idle();save('scope',{started:new Date().toISOString(),pid:589674,speech_native:[...lastNative],limits:'Short original CPU16-profile smoke only. No STT changes, private media reads, service restart or hybrid load. Abort only this test on contention.'});
 timer=setInterval(async()=>{if(busy)return;busy=true;try{await guard()}catch(e){failure=String(e);abort.abort()}finally{busy=false}},500);
 // Exact retained messages: distinguish sampling/parser policy from a failing implicit-answer fixture.
 const messages=[...original,oldCall,result];
 // Prior implicit-answer failure retained in the earlier report; do not rerun it here.
 // A prespecified end-to-end fixture makes the final-answer requirement explicit before tool use.
 const explicit:any[]=[{role:'system',content:'Use lookup_stock exactly once for the requested SKU. After its result arrives, answer the user with the quantity from that result.'},{role:'user',content:'How many items of SKU PANDA-RESTORE are in stock? Look it up, then reply with the quantity only.'}];
 const first=await post('explicit-call','/v1/chat/completions',{...defaults,messages:explicit,tool_choice:'required',cache_prompt:true});const tc=first.choices[0].message.tool_calls?.[0];if(tc?.function.name!=='lookup_stock'||JSON.parse(tc.function.arguments).sku!=='PANDA-RESTORE')throw Error('Explicit fixture tool call failed');explicit.push(first.choices[0].message,{role:'tool',tool_call_id:tc.id,content:result.content});
 for(const choice of ['none','auto']){const answer=await post('explicit-answer-'+choice,'/v1/chat/completions',{...defaults,messages:explicit,tool_choice:choice,cache_prompt:true});rows.push({case:'explicit-'+choice,message:answer.choices[0].message,finish:answer.choices[0].finish_reason,usage:answer.usage,pass:answer.choices[0].message.content?.trim()==='23'});}
 const answer=rows.find(r=>r.case==='explicit-auto');if(answer.pass){explicit.push(answer.message,{role:'user',content:'Reply exactly RESTORED'});const tail=await post('explicit-append','/v1/chat/completions',{...defaults,messages:explicit,tool_choice:'none',cache_prompt:true});rows.push({case:'append',message:tail.choices[0].message,cache_n:tail.timings?.cache_n,prompt_n:tail.timings?.prompt_n,pass:tail.choices[0].message.content?.trim()==='RESTORED'&&tail.timings?.cache_n>80})}
}catch(e){failure ||= String(e);console.error(failure);process.exitCode=1}
finally{clearInterval(timer);while(busy)await Bun.sleep(50);save('results',{finished:new Date().toISOString(),failure,calls,rows,limits:'One observation per variant; prompt sensitivity and tool-choice differences are diagnostic, not broad tool reliability evidence.'});console.log(JSON.stringify({failure,calls,rows},null,2))}
