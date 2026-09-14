/** SCRIPT_JDOC:
{"summary":"Verify live accelerated SSE toolcall, warm CPU result/cache and pinnedworker identity before marking rollout healthy","kind":"mixed","weight":"standard","role":"entrypoint"}
*/
import{readFileSync,writeFileSync,readdirSync}from'node:fs';import{createHash}from'node:crypto';
const root=import.meta.dir,base='http://127.0.0.1:8091',rows:any[]=[];
const assert=(v:unknown,s:string)=>{if(!v)throw Error(s)},text=(p:string)=>{try{return readFileSync(p,'utf8')}catch{return ''}};
let previous=new Map<number,number>();
async function guard(){const r=await fetch('http://127.0.0.1:8092/api/jobs',{signal:AbortSignal.timeout(3000)}),jobs=await r.json();assert(r.ok&&Array.isArray(jobs)&&jobs.every(x=>['completed','failed','cancelled'].includes(x.state)),'Speech jobs');
 const now=new Map<number,number>();for(const p of readdirSync('/proc').filter(p=>/^\d+$/.test(p))){const comm=text(`/proc/${p}/comm`).trim();assert(comm!=='whisper-cli','Speech CLI');if(comm==='diar-server'){const s=text(`/proc/${p}/stat`).replace(/^.*\) /,'').split(' '),ticks=Number(s[11])+Number(s[12]);assert(!previous.has(+p)||ticks-previous.get(+p)!<=10,'Speech native work');now.set(+p,ticks)}}previous=now;
 const p=Bun.spawn(['ss','-tn','state','established','( sport = :8092 or sport = :8701 )'],{stdout:'pipe',stderr:'ignore'}),s=await new Response(p.stdout).text();assert(await p.exited===0&&!s.split('\n').slice(1).some(l=>Number(l.trim().split(/\s+/)[0])>0),'Speech socket queue');
 assert(Number(text('/proc/meminfo').match(/^MemAvailable:\s+(\d+)/m)?.[1]??0)>=6*1048576,'Memory reserve');
}
const cancel=new AbortController();let checking=false,failure='',timer:ReturnType<typeof setInterval>|undefined;
const guardSamples:any[]=[];
function snapshot(){
 const workers=[];
 for(const pid of readdirSync('/proc').filter(p=>/^\d+$/.test(p))){
  const argv=text(`/proc/${pid}/cmdline`).split('\0'),port=argv[argv.indexOf('--port')+1];
  if(argv[0]?.endsWith('/llama-server')&&['18092','18093'].includes(port)){
   const status=text(`/proc/${pid}/status`);
   workers.push({pid:+pid,port,rss_kib:Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1]??0),swap_kib:Number(status.match(/^VmSwap:\s+(\d+)/m)?.[1]??0)});
  }
 }
 const mem=text('/proc/meminfo');
 const row={at:new Date().toISOString(),available_kib:Number(mem.match(/^MemAvailable:\s+(\d+)/m)?.[1]??0),workers};
 guardSamples.push(row);writeFileSync(root+'/cutover-guard-samples.json',JSON.stringify(guardSamples,null,2)+'\n');
 return row;
}

const api=async(p:string,body?:any)=>{const r=await fetch(base+p,{method:body?'POST':'GET',headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.any([cancel.signal,AbortSignal.timeout(180000)]),timeout:false});if(!r.ok)throw Error('HTTP '+r.status+' '+p);return r.json()};
for(let i=0;i<120;i++){try{await api('/health');break}catch{await Bun.sleep(500)}}
const tools=[{type:'function',function:{name:'lookup_stock',description:'Read fixture inventory',parameters:{type:'object',properties:{sku:{type:'string'}},required:['sku'],additionalProperties:false}}}];
const messages:any[]=[{role:'system',content:'Use lookup_stock exactly once. After its result, answer with the quantity only.'},{role:'user',content:Array.from({length:250},(_,i)=>`Inventory record ${i}: preserve the supplied stock identifier and quantity in all follow-ups.`).join('\n')+'\nHow many items of SKU PANDA-RESTORE are in stock? Look it up, then reply with the quantity only.'}];
const defaults={tools,temperature:0,seed:42,max_tokens:96,cache_prompt:true,chat_template_kwargs:{enable_thinking:false}};
try{
 await guard();await Bun.sleep(1100);await guard();
 snapshot();
 timer=setInterval(async()=>{if(checking)return;checking=true;try{const sample=snapshot();await guard();const cpu=sample.workers.find(w=>w.port==='18092');assert(cpu&&cpu.swap_kib<=16384,'CPU missing or swap guard')}catch(e){failure=String(e);writeFileSync(root+'/cutover-guard-failure.json',JSON.stringify({at:new Date().toISOString(),failure,last_sample:guardSamples.at(-1)},null,2)+'\n');cancel.abort()}finally{checking=false}},500);
 const r=await fetch(base+'/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...defaults,messages,tool_choice:'required',stream:true,stream_options:{include_usage:true}}),signal:AbortSignal.any([cancel.signal,AbortSignal.timeout(180000)]),timeout:false});const raw=await r.text();if(!r.ok||r.headers.get('x-hybrid-route')!=='gpu-cold'||!raw.includes('[DONE]'))throw Error('ProductioncoldSSE');
 let tc:any={id:'',type:'function',function:{name:'',arguments:''}},timings:any;
 for(const line of raw.split('\n'))if(line.startsWith('data: ')&&!line.includes('[DONE]')){const x=JSON.parse(line.slice(6));if(x.timings)timings=x.timings;for(const c of x.choices?.[0]?.delta?.tool_calls??[]){if(c.id)tc.id=c.id;if(c.function?.name)tc.function.name+=c.function.name;if(c.function?.arguments)tc.function.arguments+=c.function.arguments}}
 if(tc.function.name!=='lookup_stock'||JSON.parse(tc.function.arguments).sku!=='PANDA-RESTORE'||timings?.cache_n!==5235||timings?.prompt_n!==1)throw Error('Productioncoldcoverage/tool');rows.push({label:'cold-sse',route:r.headers.get('x-hybrid-route'),timings,tool:tc});
 messages.push({role:'assistant',content:null,tool_calls:[tc]},{role:'tool',tool_call_id:tc.id,content:'{"quantity":23,"sku":"PANDA-RESTORE"}'});
 for(const choice of ['none','auto']){const answer=await api('/v1/chat/completions',{...defaults,messages,tool_choice:choice});if(answer.choices[0].message.content?.trim()!=='23'||answer.timings.cache_n<5235)throw Error('Warmtool');rows.push({label:'tool-'+choice,response:answer});}
 messages.push({role:'assistant',content:'23'},{role:'user',content:'Reply exactly RESTORED'});const tail=await api('/v1/chat/completions',{...defaults,messages,tool_choice:'none'});if(tail.choices[0].message.content?.trim()!=='RESTORED'||tail.timings.cache_n<5235)throw Error('Warmappend');rows.push({label:'append',response:tail});
 const status=await api('/hybrid/status'),slots=await api('/slots'),models=await api('/v1/models');if(status.active||status.counters.gpu!==1||status.counters.warm<3||slots.length!==2||slots.some(s=>s.is_processing||s.n_ctx!==131072))throw Error('Servingstatus');
 const info=JSON.parse(readFileSync('/var/home/agent/.cache/llama-gemma-hybrid/state/supervisor.json','utf8'));const cfg=JSON.parse(readFileSync('/var/home/agent/.local/share/llama-gemma-hybrid/releases/20260911-attn4/config.json','utf8'));const argv=text('/proc/'+info.cpu_pid+'/cmdline').split('\0').filter(Boolean),env=text('/proc/'+info.cpu_pid+'/environ').split('\0');assert(JSON.stringify(argv)===JSON.stringify(cfg.cpu.argv)&&env.includes('GGML_CPU_EXPERIMENTAL_ATTN4=1')&&env.includes('LLAMA_EXPERIMENTAL_SMALL_TARGET_BATCH=1'),'CPU argv/flags');const maps=readFileSync('/proc/'+info.cpu_pid+'/maps','utf8');for(const [path,expected]of Object.entries(cfg.cpu.hashes)){const hash=createHash('sha256').update(readFileSync(path)).digest('hex');if(!maps.includes(path)||hash!==expected)throw Error('CPUidentity');}
 const swap=Number(readFileSync('/proc/'+info.cpu_pid+'/status','utf8').match(/^VmSwap:\s+(\d+)/m)?.[1]??Infinity);if(swap!==0)throw Error('CPUswap');
 for(const p of readdirSync('/proc').filter(p=>/^\d+$/.test(p)))try{if(readFileSync('/proc/'+p+'/cmdline','utf8').includes('--port\x0018093\x00'))throw Error('GPUorphan')}catch(e){if(e.code!=='ENOENT'&&e.code!=='ESRCH')throw e}
 await guard();assert(!failure,'Continuous guard: '+failure);
 writeFileSync(root+'/production-smoke.json',JSON.stringify({pass:true,verified_at:new Date().toISOString(),rows,status,slots,models,info,cpu_swap_kib:swap,cpu_hashes:cfg.cpu.hashes,argv,experimental_flags:env.filter(x=>/^(GGML_CPU_EXPERIMENTAL_|LLAMA_EXPERIMENTAL_)/.test(x)),continuous_guard:true},null,2));
}catch(e){writeFileSync(root+'/production-smoke.json',JSON.stringify({pass:false,error:String(e),guard_failure:failure,rows,verified_at:new Date().toISOString()},null,2));throw e}finally{if(timer)clearInterval(timer);while(checking)await Bun.sleep(25)}
