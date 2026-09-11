/** SCRIPT_JDOC:
{"summary":"Complete staged native GPUkill/CPUrestart/prefillcancel coverage without repeating passed API checks","kind":"mixed","weight":"heavy","role":"entrypoint"}
*/
import{readFileSync,readdirSync,writeFileSync}from'node:fs';
const root=import.meta.dir,base='http://127.0.0.1:18091',rows:any[]=[];
const text=(p:string)=>{try{return readFileSync(p,'utf8')}catch{return ''}};
async function guard(){const r=await fetch('http://127.0.0.1:8092/api/jobs',{signal:AbortSignal.timeout(2000)}),jobs=await r.json();if(!r.ok||!Array.isArray(jobs)||jobs.some(x=>!['completed','failed','cancelled'].includes(x.state)))throw Error('Speechactive');if(Number(text('/proc/meminfo').match(/^MemAvailable:\s+(\d+)/m)?.[1]??0)<6*1048576)throw Error('Memoryreserve');}
async function waitReady(){for(let i=0;i<120;i++){await guard();try{if((await fetch(base+'/health',{signal:AbortSignal.timeout(500)})).ok)return}catch{}await Bun.sleep(500)}throw Error('Health')}
async function post(body:any,signal?:AbortSignal){return fetch(base+'/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:signal??AbortSignal.timeout(300000),timeout:false})}
const defaults={max_tokens:32,temperature:0,cache_prompt:true,chat_template_kwargs:{enable_thinking:false}};
const cold={...defaults,messages:[{role:'system',content:'New independent recovery validation. Follow exact literal output.'},{role:'user',content:Array.from({length:210},(_,i)=>`Reference ${i}: preserve the supplied identifier and quantity in every follow-up without changing its spelling.`).join('\n')+'\nReply exactly FALLBACK-42'}]};
async function findPid(port:number){for(let i=0;i<200;i++){await guard();for(const p of readdirSync('/proc').filter(p=>/^\d+$/.test(p))){const a=text('/proc/'+p+'/cmdline');if(text('/proc/'+p+'/comm').trim()==='llama-server'&&a.includes('--port\x00'+port+'\x00')&&a.includes(root+'/state/'))return +p}await Bun.sleep(100)}throw Error('OwnedPIDnotfound'+port)}
async function idle(){for(let i=0;i<120;i++){const s=await fetch(base+'/hybrid/status').then(r=>r.json());if(!s.active)return;await Bun.sleep(250)}throw Error('Undrainedadapter')}
try{
 await waitReady();
 const render=await fetch(base+'/apply-template',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(cold)}).then(r=>r.json());
 const tokens=await fetch(base+'/tokenize',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({content:render.prompt,add_special:true,parse_special:true})}).then(r=>r.json());if(tokens.tokens.length<4096||tokens.tokens.length>12000)throw Error('Recoveryfixturecoverage');rows.push({label:'fixture',tokens:tokens.tokens.length});
 // Cancel during actualGPUprefill, before any CPUdecode. Then retry same cold request.
 const cancel=new AbortController();const pending=post(cold,cancel.signal).then(r=>r.text()).catch(()=>null);const gpu=await findPid(18093);await Bun.sleep(2500);cancel.abort();await pending;await idle();if(text('/proc/'+gpu+'/comm').trim()==='llama-server')throw Error('GPUcancelorphan');rows.push({label:'native-prefill-cancel',pid:gpu,pass:true});
 const failure=post(cold);const failedGpu=await findPid(18093);await Bun.sleep(1500);process.kill(failedGpu,'SIGKILL');const response=await failure;const result=await response.json();rows.push({label:'native-gpu-kill-fallback',pid:failedGpu,status:response.status,route:response.headers.get('x-hybrid-route'),result});if(response.status!==200||response.headers.get('x-hybrid-route')!=='cpu-fallback'||!result.choices?.[0]?.message?.content?.includes('FALLBACK-42'))throw Error('GPUkillfallback');
 const before=JSON.parse(text(root+'/state/supervisor.json')),oldCpu=await findPid(18092);process.kill(oldCpu,'SIGKILL');let after:any;
 for(let i=0;i<120;i++){await Bun.sleep(500);try{after=JSON.parse(text(root+'/state/supervisor.json'));if(after.pid!==before.pid){await waitReady();break}}catch{}}if(!after||after.pid===before.pid||after.cpu_pid===oldCpu||text('/proc/'+oldCpu+'/comm'))throw Error('CPUgenerationrestart');rows.push({label:'native-cpu-generation-restart',before,after,pass:true});
 const short=await post({...defaults,messages:[{role:'user',content:'Reply exactly RECOVERED'}]});const answer=await short.json();if(!answer.choices?.[0]?.message?.content.includes('RECOVERED'))throw Error('Recoveredanswer');rows.push({label:'recovered',status:short.status,answer});
 // Fillslot0short, then coldGPUrestoreintosecondCPUslot. Also validates retry afterGPUdeath.
 const second=await post({...cold,id_slot:1});const secondBody=await second.json();rows.push({label:'cold-after-recovery-slot1',route:second.headers.get('x-hybrid-route'),response:secondBody});if(second.headers.get('x-hybrid-route')!=='gpu-cold'||secondBody.timings?.prompt_n!==1||secondBody.timings?.cache_n!==tokens.tokens.length-1)throw Error('Slot1handoff');
 writeFileSync(root+'/recovery-results.json',JSON.stringify({pass:true,rows,finished_at:new Date().toISOString()},null,2));
}catch(e){writeFileSync(root+'/recovery-results.json',JSON.stringify({pass:false,error:String(e),rows,finished_at:new Date().toISOString()},null,2));console.error(e);process.exitCode=1}
