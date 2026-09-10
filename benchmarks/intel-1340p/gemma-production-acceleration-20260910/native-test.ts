/** SCRIPT_JDOC:
{"summary":"Validate staged hybrid streaming, tools, ownership, cancellation and native worker recovery under speech guards","kind":"mixed","weight":"heavy","role":"entrypoint"}
*/
import{readFileSync,writeFileSync,readdirSync}from'node:fs';
const root=import.meta.dir,base='http://127.0.0.1:18091',rows:any[]=[];
const save=(n:string,v:any)=>writeFileSync(root+'/'+n+'.json',JSON.stringify(v,null,2)+'\n');
const text=(p:string)=>{try{return readFileSync(p,'utf8')}catch{return ''}};
let stopped='',timer:any,busy=false,last=new Map<number,number>();
async function command(args:string[]){const p=Bun.spawn(args,{stdout:'pipe',stderr:'pipe'});const [rc,out,err]=await Promise.all([p.exited,new Response(p.stdout).text(),new Response(p.stderr).text()]);if(rc)throw Error(err);return out.trim()}
async function guard(){
 const r=await fetch('http://127.0.0.1:8092/api/jobs',{signal:AbortSignal.timeout(2500)});if(!r.ok)throw Error('SpeechguardHTTP');const jobs=await r.json();if(!Array.isArray(jobs)||jobs.some(x=>!['completed','failed','cancelled'].includes(x.state)))throw Error('Speechactive');
 const now=new Map<number,number>();for(const p of readdirSync('/proc').filter(p=>/^\d+$/.test(p))){const comm=text('/proc/'+p+'/comm').trim();if(comm==='whisper-cli')throw Error('SpeechCLI');if(comm==='diar-server'){const s=text('/proc/'+p+'/stat').replace(/^.*\) /,'').split(' '),n=Number(s[11])+Number(s[12]);if(last.has(+p)&&n-last.get(+p)!>10)throw Error('NativeSpeech');now.set(+p,n)}}last=now;
 const sockets=await command(['ss','-tn','state','established','( sport = :8092 or sport = :8701 )']);if(sockets.split('\n').slice(1).some(l=>Number(l.trim().split(/\s+/)[0])>0))throw Error('Speechqueue');
 if(Number(text('/proc/meminfo').match(/^MemAvailable:\s+(\d+)/m)?.[1]??0)<6*1048576)throw Error('Memoryreserve');
 for(const p of readdirSync('/proc').filter(p=>/^\d+$/.test(p))){const argv=text('/proc/'+p+'/cmdline');if(argv.includes('--port\x0018092\x00')||argv.includes('--port\x0018093\x00'))if(Number(text('/proc/'+p+'/status').match(/^VmSwap:\s+(\d+)/m)?.[1]??0)>16384)throw Error('Trialswap')}
}
async function health(){for(let i=0;i<120;i++){if(stopped)throw Error(stopped);try{if((await fetch(base+'/health',{signal:AbortSignal.timeout(1000)})).ok)return}catch{}await Bun.sleep(500)}throw Error('Staginghealth')}
async function idle(){for(let i=0;i<120;i++){const x=await fetch(base+'/hybrid/status').then(r=>r.json());if(!x.active)return;await Bun.sleep(250)}throw Error('Adapterdidnotdrain')}
async function post(label:string,body:any,signal?:AbortSignal){if(stopped)throw Error(stopped);await guard();const t=performance.now(),r=await fetch(base+'/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:signal??AbortSignal.timeout(180000),timeout:false});const route=r.headers.get('x-hybrid-route');if(!r.ok)throw Error(label+' HTTP'+r.status+' '+await r.text());const response=await r.json();rows.push({label,route,ms:performance.now()-t,response});save('native-results-progress',rows);return {response,route}}
const tools=[{type:'function',function:{name:'lookup_stock',description:'Read fixture inventory',parameters:{type:'object',properties:{sku:{type:'string'}},required:['sku'],additionalProperties:false}}}];
const messages:any[]=[{role:'system',content:'Use lookup_stock exactly once. After its result, answer with the quantity only.'},{role:'user',content:Array.from({length:250},(_,i)=>`Inventory record ${i}: preserve the supplied stock identifier and quantity in all follow-ups.`).join('\n')+'\nHow many items of SKU PANDA-RESTORE are in stock? Look it up, then reply with the quantity only.'}];
const defaults={temperature:0,seed:42,max_tokens:96,cache_prompt:true,chat_template_kwargs:{enable_thinking:false}};
async function pid(port:number){for(let i=0;i<80;i++){for(const p of readdirSync('/proc').filter(p=>/^\d+$/.test(p))){const argv=text('/proc/'+p+'/cmdline');if(text('/proc/'+p+'/comm').trim()==='llama-server'&&argv.includes('--port\x00'+port+'\x00')&&argv.includes(root+'/state/'))return +p}await Bun.sleep(100)}throw Error('StagedPIDnotfound '+port)}
try{
 await guard();await Bun.sleep(1200);await guard();timer=setInterval(async()=>{if(busy)return;busy=true;try{await guard()}catch(e){stopped=String(e);await command(['systemctl','--user','stop','gemma-hybrid-staging.service']).catch(()=>{})}finally{busy=false}},750);
 await health();
 // Cold native SSE is consumed verbatim; reconstruct only the fixture tool call for this test.
 const r=await fetch(base+'/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...defaults,messages,tools,tool_choice:'required',stream:true,stream_options:{include_usage:true}}),signal:AbortSignal.timeout(180000),timeout:false});
 const route=r.headers.get('x-hybrid-route'),raw=await r.text();save('cold-sse',{route,status:r.status,raw});if(!r.ok||route!=='gpu-cold'||!raw.includes('[DONE]'))throw Error('Coldstreamroute');
 let tool:any={id:'',type:'function',function:{name:'',arguments:''}},timings:any;
 for(const line of raw.split('\n'))if(line.startsWith('data: ')&&!line.includes('[DONE]')){const x=JSON.parse(line.slice(6));if(x.timings)timings=x.timings;for(const tc of x.choices?.[0]?.delta?.tool_calls??[]){if(tc.id)tool.id=tc.id;if(tc.function?.name)tool.function.name+=tc.function.name;if(tc.function?.arguments)tool.function.arguments+=tc.function.arguments}}
 if(tool.function.name!=='lookup_stock'||JSON.parse(tool.function.arguments).sku!=='PANDA-RESTORE')throw Error('Streamtoolcall');rows.push({label:'cold-sse',route,tool,timings});await idle();
 messages.push({role:'assistant',content:null,tool_calls:[tool]},{role:'tool',tool_call_id:tool.id,content:'{"quantity":23,"sku":"PANDA-RESTORE"}'});
 const warm=await post('warm-tool',{...defaults,messages,tools,tool_choice:'none'});if(warm.route!=='cpu-owner'||warm.response.choices[0].message.content?.trim()!=='23'||warm.response.timings.cache_n<4000)throw Error('Warmtoolownership');
 const other=await post('other-owner',{...defaults,messages:[{role:'user',content:'Reply exactly OTHER-17'}]});if(!other.response.choices[0].message.content.includes('OTHER-17'))throw Error('Otherowner');
 const back=await post('return-owner',{...defaults,messages,tools,tool_choice:'none'});if(back.route!=='cpu-owner')throw Error('Ownerlost');
 // Cancel a queued request without disturbing the active native stream.
 const longBody={...defaults,messages:[{role:'user',content:'Count from1 to500, one number per line. Do not stop early.'}],max_tokens:512,stream:true};
 const active=await fetch(base+'/v1/chat/completions',{method:'POST',body:JSON.stringify(longBody),headers:{'content-type':'application/json'},timeout:false});const reader=active.body!.getReader();await reader.read();
 const queuedAbort=new AbortController();const queued=fetch(base+'/v1/chat/completions',{method:'POST',body:JSON.stringify({...defaults,messages:[{role:'user',content:'QUEUED'}]}),headers:{'content-type':'application/json'},signal:queuedAbort.signal}).catch(()=>null);await Bun.sleep(150);queuedAbort.abort();await queued;await reader.cancel();await idle();rows.push({label:'queued-and-decode-cancel',pass:true});
 // GPU process SIGKILL must fall back before any CPU output, leaving supervisor alive.
 const failBody={...defaults,messages:[{role:'system',content:'You are validating a different independent session.'},{role:'user',content:Array.from({length:260},(_,i)=>`Reference ${i}: store exact recall identifier without changing its spelling.`).join('\n')+'\nReply exactly FALLBACK-42'}]};
 const pending=post('native-gpu-kill-fallback',failBody);const gpuPid=await pid(18093);process.kill(gpuPid,'SIGKILL');const fallback=await pending;if(fallback.route!=='cpu-fallback'||!fallback.response.choices[0].message.content.includes('FALLBACK-42'))throw Error('GPUkillfallback');
 // Actual CPU worker death invalidates its entire supervisor generation.
 const before=JSON.parse(text(root+'/state/supervisor.json')),cpuPid=await pid(18092);process.kill(cpuPid,'SIGKILL');
 for(let i=0;i<120;i++){await Bun.sleep(500);try{const after=JSON.parse(text(root+'/state/supervisor.json'));if(after.pid!==before.pid){await health();rows.push({label:'native-cpu-generation-restart',before,after});break}}catch{}}
 if(!rows.some(x=>x.label==='native-cpu-generation-restart'))throw Error('CPUrestart');
 const recovered=await post('recovered',{...defaults,messages:[{role:'user',content:'Reply exactly RECOVERED'}]});if(!recovered.response.choices[0].message.content.includes('RECOVERED'))throw Error('Recoveredanswer');
 save('native-results',{pass:true,rows,finished_at:new Date().toISOString(),limits:'Shortnativeintegration only;full64Kbackendalreadytestedseparately;fullpopulated128Kfallbackunqualified'});
}catch(e){save('native-results',{pass:false,error:String(e),rows,finished_at:new Date().toISOString()});console.error(e);process.exitCode=1}
finally{clearInterval(timer);while(busy)await Bun.sleep(25)}
