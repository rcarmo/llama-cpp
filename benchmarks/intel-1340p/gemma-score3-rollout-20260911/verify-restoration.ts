/** SCRIPT_JDOC:
{"summary":"Verify unchanged deployed smallbatchhybrid identity and shortCPUtool/cache smoke after maintenance","kind":"mixed","weight":"standard","role":"entrypoint"}
*/
import{readFileSync,writeFileSync,readdirSync}from'node:fs';import{createHash}from'node:crypto';
import{checkSpeechJobs}from'./speech';
const root=import.meta.dir,base='http://127.0.0.1:8091',sha=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const assert=(v:unknown,s:string)=>{if(!v)throw Error(s)},text=(p:string)=>{try{return readFileSync(p,'utf8')}catch{return ''}};
const config='/var/home/agent/.local/share/llama-gemma-hybrid/releases/20260911-attn4/config.json',unit='/var/home/agent/.config/systemd/user/llama-gemma-local-provider.service';
assert(sha(config)===sha(root+'/baseline/hybrid.json')&&sha(unit)===sha(root+'/baseline/hybrid.service'),'Changed hybrid config/unit');
const cfg=JSON.parse(readFileSync(config,'utf8')),info=JSON.parse(readFileSync(cfg.stateDir+'/supervisor.json','utf8'));const maps=text(`/proc/${info.cpu_pid}/maps`),argv=text(`/proc/${info.cpu_pid}/cmdline`).split('\0').filter(Boolean),env=Object.fromEntries(text(`/proc/${info.cpu_pid}/environ`).split('\0').filter(x=>/^(LLAMA_EXPERIMENTAL_SMALL_TARGET_BATCH|GGML_CPU_EXPERIMENTAL_ATTN4)=/.test(x)).map(x=>x.split('=')));
assert(JSON.stringify(argv)===JSON.stringify(cfg.cpu.argv)&&env.LLAMA_EXPERIMENTAL_SMALL_TARGET_BATCH==='1'&&env.GGML_CPU_EXPERIMENTAL_ATTN4==='1','CPU identity/flag');
const libraries=Object.entries(cfg.cpu.hashes).map(([path,expected])=>({path,expected,actual:sha(path),mapped:maps.includes(path)}));assert(libraries.every(x=>x.expected===x.actual&&x.mapped),'Pinned mappedfiles');
const swap=Number(text(`/proc/${info.cpu_pid}/status`).match(/^VmSwap:\s+(\d+)/m)?.[1]??Infinity);assert(swap===0,'Production swap');
let previous=new Map<number,number>();
async function guard(){await checkSpeechJobs('stopped');
 const now=new Map<number,number>();for(const p of readdirSync('/proc').filter(p=>/^\d+$/.test(p))){const comm=text(`/proc/${p}/comm`).trim();assert(comm!=='whisper-cli','Speech CLI');if(comm==='diar-server'){const s=text(`/proc/${p}/stat`).replace(/^.*\) /,'').split(' '),ticks=Number(s[11])+Number(s[12]);assert(!previous.has(+p)||ticks-previous.get(+p)!<=10,'Speech native work');now.set(+p,ticks)}}previous=now;
 const p=Bun.spawn(['ss','-tn','state','established','( sport = :8092 or sport = :8701 )'],{stdout:'pipe',stderr:'ignore'}),s=await new Response(p.stdout).text();assert(await p.exited===0&&!s.split('\n').slice(1).some(l=>Number(l.trim().split(/\s+/)[0])>0),'Speech socket queue');
 assert(Number(text('/proc/meminfo').match(/^MemAvailable:\s+(\d+)/m)?.[1]??0)>=6*1048576,'Memory reserve');
}
const cancel=new AbortController();let checking=false,failure='';await guard();await Bun.sleep(1100);await guard();
const timer=setInterval(async()=>{if(checking)return;checking=true;try{await guard()}catch(e){failure=String(e);cancel.abort()}finally{checking=false}},500);
const rows:any[]=[];
async function post(body:any){await guard();const state=await fetch(base+'/hybrid/status').then(r=>r.json());assert(!state.active&&state.queued===0,'Idle hybrid');const r=await fetch(base+'/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.any([cancel.signal,AbortSignal.timeout(45000)]),timeout:false});assert(r.ok,'Smoke HTTP');const answer=await r.json();rows.push({route:r.headers.get('x-hybrid-route'),response:answer});return answer}
try{
 const tools=[{type:'function',function:{name:'lookup_stock',description:'Read fixture inventory',parameters:{type:'object',properties:{sku:{type:'string'}},required:['sku'],additionalProperties:false}}}],messages:any[]=[{role:'system',content:'Use lookup_stock exactly once. After its result, reply with the quantity only.'},{role:'user',content:'How many items of SKU PANDA-RESTORE? Look it up, then return the quantity only.'}];const defaults={tools,max_tokens:64,temperature:0,seed:42,cache_prompt:true,chat_template_kwargs:{enable_thinking:false}};
 const first=await post({...defaults,messages,tool_choice:'required'}),tc=first.choices[0].message.tool_calls?.[0];assert(tc?.function.name==='lookup_stock'&&JSON.parse(tc.function.arguments).sku==='PANDA-RESTORE','Tool call');messages.push(first.choices[0].message,{role:'tool',tool_call_id:tc.id,content:'{"quantity":23,"sku":"PANDA-RESTORE"}'});
 let answer:any;for(const choice of ['none','auto']){answer=await post({...defaults,messages,tool_choice:choice});assert(answer.choices[0].message.content?.trim()==='23','Tool answer')}
 messages.push(answer.choices[0].message,{role:'user',content:'Reply exactly RESTORED'});const tail=await post({...defaults,messages,tool_choice:'none'});assert(tail.choices[0].message.content?.trim()==='RESTORED'&&tail.timings.cache_n>80,'Cached append');
 assert(!failure&&rows.every(r=>r.route!=='gpu-cold'),'CPU-only short smoke');const status=await fetch(base+'/hybrid/status').then(r=>r.json()),slots=await fetch(base+'/slots').then(r=>r.json());assert(!status.active&&status.queued===0&&slots.length===2&&slots.every(s=>s.n_ctx===131072&&!s.is_processing),'Restored idle slots');
 writeFileSync(root+'/restoration-check.json',JSON.stringify({pass:true,verified_at:new Date().toISOString(),info,swap_kib:swap,libraries,unit_sha256:sha(unit),config_sha256:sha(config),rows,status,slots},null,2)+'\n');console.log('PASS unchanged ATTN4 hybrid, pinnedmaps/flag, tools/cache, idle slots, zero swap');
}finally{clearInterval(timer);while(checking)await Bun.sleep(25)}
