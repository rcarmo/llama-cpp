/** SCRIPT_JDOC:
{"summary":"Guarded Gemma packed-KV and CPU/Vulkan handoff trials with speech contention protection","kind":"mixed","weight":"heavy","role":"entrypoint","domains":["inference","benchmarks"]}
*/
import {readFileSync,writeFileSync,mkdirSync,openSync,closeSync,unlinkSync,readdirSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
export const root='/var/home/agent/workspace/reports/gemma-gpu-attention-20260910';
export const prior='/var/home/agent/workspace/reports/gemma-simd-async-20260906';
export const save=(p:string,x:any)=>{mkdirSync(p.substring(0,p.lastIndexOf('/')),{recursive:true});writeFileSync(p,JSON.stringify(x,null,2)+'\n')};
export const text=(p:string)=>{try{return readFileSync(p,'utf8').trim()}catch{return ''}};
export const sleep=(ms:number)=>Bun.sleep(ms);
export const hash=(x:any)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const num=(s:string,k:string)=>Number(s.match(new RegExp('^'+k+':?\\s+(\\d+)','m'))?.[1]??0);
export async function api(url:string,body?:any,timeout=1200000){const r=await fetch(url,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(timeout),timeout:false});const s=await r.text();if(!r.ok)throw Error(`HTTP ${r.status} ${url}: ${s.slice(0,500)}`);return JSON.parse(s)}
function ps(pid:number){const s=text(`/proc/${pid}/status`),stat=text(`/proc/${pid}/stat`).replace(/^.*\) /,'').split(' ');return {pid,rss_kib:num(s,'VmRSS'),pss_kib:num(text(`/proc/${pid}/smaps_rollup`),'Pss'),swap_kib:num(s,'VmSwap'),cpu_ticks:Number(stat[11]??0)+Number(stat[12]??0),majflt:Number(stat[9]??0)}}
function natives(){const a:any[]=[];for(const n of readdirSync('/proc'))if(/^\d+$/.test(n)){const comm=text(`/proc/${n}/comm`);if(comm==='diar-server'||comm==='whisper-cli')a.push({comm,...ps(Number(n))})}return a}
async function socketActivity(){const p=Bun.spawn(['ss','-tn','state','established','( sport = :8092 or sport = :8701 )'],{stdout:'pipe',stderr:'ignore'});const s=await new Response(p.stdout).text();await p.exited;return s.split('\n').slice(1).some(l=>{const c=l.trim().split(/\s+/);return c.length>=4&&Number(c[0])>0})}
const energyPath='/sys/class/powercap/intel-rapl:0/energy_uj';
async function energy(){const p=Bun.spawn(['sudo','-n','cat',energyPath],{stdout:'pipe',stderr:'ignore'});const [rc,s]=await Promise.all([p.exited,new Response(p.stdout).text()]);return rc===0?Number(s):null}
export type Cfg={kind?:'screen'|'handoff',format?:'f16'|'q8_0'|'q4_0',fa?:boolean,full?:boolean,ctx?:number,parallel?:number,n?:number,predict?:number,build?:'baseline'|'build-cpu',rounds?:number,verbose?:boolean,cache?:number,sequential?:boolean,warmShape?:boolean,maintenance?:boolean,mtp?:boolean,cpuFull?:boolean,gpuFull?:boolean,cpuCtx?:number,gpuCtx?:number,slotPath?:string,checkpointStep?:number,vulkanF32?:boolean,vulkanBuild?:string,cpuBuild?:string,preserveSwaPadding?:boolean,decodeThreads?:number,decodeMask?:string,draftMax?:number,extraEnv?:Record<string,string>,perfVulkan?:boolean,ubatch?:number,batch?:number};
export class Trial{
 dir:string; servers:any[]=[];samples:any[]=[];calls:any[]=[];phase='init';error='';timer:any;busy=false;lockfd=-1;nativeLast:any[]=[];liveSwap=0;livePid=602513;sequence=0;
 constructor(public name:string,public cfg:Cfg={}){if(!/^[a-z0-9-]+$/.test(name))throw Error('Unsafe name');this.dir=`${root}/runs/${name}`;if(text(this.dir+'/result.json'))throw Error('Retained run exists: '+name);mkdirSync(this.dir,{recursive:true})}
 async check(){
  const jobs=await api('http://127.0.0.1:8092/api/jobs',undefined,3000);if(!Array.isArray(jobs))throw Error('Unknown STT job schema');if(jobs.some(j=>!['completed','failed','cancelled'].includes(j.state)))throw Error('Speech job active');
  if(this.cfg.maintenance){
   if(process.env.GEMMA_MAINTENANCE_APPROVED!=='20260910')throw Error('Maintenance mode requires authorised runner');
   const p=Bun.spawn(['systemctl','--user','show','llama-gemma-local-provider.service','-p','ActiveState','--value'],{stdout:'pipe',stderr:'ignore'});const state=(await new Response(p.stdout).text()).trim();await p.exited;if(state!=='inactive')throw Error('Production service must be inactive during maintenance');
  }else{const slots=await api('http://127.0.0.1:8091/slots',undefined,3000);if(slots.some(s=>s.is_processing))throw Error('Production LLM request active');}
  const ns=natives();if(ns.some(s=>s.comm==='whisper-cli'))throw Error('Whisper CLI active');for(const n of ns){const prev=this.nativeLast.find(p=>p.pid===n.pid);if(prev&&n.cpu_ticks-prev.cpu_ticks>10)throw Error('Native diarizer CPU work active')}this.nativeLast=ns;
  if(await socketActivity())throw Error('Speech socket has queued incoming data');
  if(!this.cfg.maintenance){const live=ps(this.livePid);if(!live.rss_kib)throw Error('Live LLM process identity changed');if(live.swap_kib>this.liveSwap+131072)throw Error('Trial evicted >128MiB additional production pages');}
  const mem=num(text('/proc/meminfo'),'MemAvailable');if(mem<6*1048576)throw Error('Memory headroom below 6GiB reserve');
  if(this.servers.some(s=>ps(s.p.pid).swap_kib>16384))throw Error('Trial process swapping');
 }
 async begin(){mkdirSync(root,{recursive:true});this.lockfd=openSync(root+'/campaign.lock','wx');writeFileSync(this.lockfd,String(process.pid));this.liveSwap=ps(this.livePid).swap_kib;
  await this.check();await sleep(1200);await this.check();save(this.dir+'/config.json',{cfg:this.cfg,started_at:new Date().toISOString(),live:ps(this.livePid),native:this.nativeLast,energy_counter:energyPath});
  this.timer=setInterval(async()=>{if(this.busy)return;this.busy=true;try{this.samples.push({at:new Date().toISOString(),phase:this.phase,temp_c:Number(text('/sys/class/thermal/thermal_zone1/temp'))/1000,throttle:Number(text('/sys/devices/system/cpu/cpu0/thermal_throttle/package_throttle_count')),mem_available_kib:num(text('/proc/meminfo'),'MemAvailable'),pswpin:num(text('/proc/vmstat'),'pswpin'),pswpout:num(text('/proc/vmstat'),'pswpout'),live:ps(this.livePid),servers:this.servers.map(s=>({device:s.device,...ps(s.p.pid)}))});await this.check();}catch(e){this.error ||= String(e);save(this.dir+'/guard-stop.json',{reason:this.error,at:new Date().toISOString(),live:ps(this.livePid),servers:this.servers.map(s=>({device:s.device,...ps(s.p.pid)}))});this.servers.forEach(s=>s.p.kill('SIGTERM'))}finally{this.busy=false}},750)
 }
 async cool(){for(let i=0;i<45&&Number(text('/sys/class/thermal/thermal_zone1/temp'))>70000;i++){await this.check();await sleep(1000)}if(this.error)throw Error(this.error)}
 async start(device:'cpu'|'vulkan',mtp=device==='cpu'&&this.cfg.mtp!==false){
  await this.check();if(this.error)throw Error(this.error);const cfg=this.cfg,build=device==='vulkan'?'build-vulkan':cfg.build??'build-cpu',base=(device==='vulkan'?cfg.vulkanBuild:cfg.cpuBuild)??`${prior}/${build}`,port=device==='cpu'?18792:18791;
  try{await api(`http://127.0.0.1:${port}/health`,undefined,700);throw Error('Trial port occupied')}catch(e){if(String(e).includes('Trial port occupied'))throw e}
  const argv=JSON.parse(text(`${prior}/handoff/swa-full/${device==='cpu'?'cpu-mtp':'vulkan'}-argv.json`));argv[0]=base+'/bin/llama-server';const set=(k:string,v:string)=>{const i=argv.indexOf(k);if(i<0)argv.push(k,v);else argv[i+1]=v};const remove=(k:string)=>{const i=argv.indexOf(k);if(i>=0)argv.splice(i,1)};
  set('--port',String(port));set('--ctx-size',String((device==='cpu'?cfg.cpuCtx:cfg.gpuCtx)??cfg.ctx??16384));set('--parallel',String(cfg.parallel??1));set('--threads-batch','16');set('--cpu-mask-batch','ffff');set('--cache-type-k',cfg.format??'f16');set('--cache-type-v',cfg.format??'f16');set('--flash-attn',cfg.fa?'on':'off');set('--cache-ram',String(cfg.cache??256));set('--slot-save-path',cfg.slotPath??this.dir+'/slots/');if(cfg.checkpointStep!==undefined)set('--checkpoint-min-step',String(cfg.checkpointStep));
  if(cfg.cache){remove('--no-cache-idle-slots');argv.push('--cache-idle-slots')}
  if(!((device==='cpu'?cfg.cpuFull:cfg.gpuFull)??cfg.full))remove('--swa-full');
  if(device==='cpu'&&!mtp){const i=argv.indexOf('--model-draft');if(i>=0)argv.splice(i);}
  if(build==='baseline')remove('--no-sched-async-cpu');
  if(mtp){set('--spec-draft-threads-batch','16');set('--spec-draft-type-k',cfg.format??'f16');set('--spec-draft-type-v',cfg.format??'f16');set('--spec-draft-cpu-mask','ff');set('--spec-draft-cpu-mask-batch','ffff');set('--spec-draft-cpu-strict','1');set('--spec-draft-cpu-strict-batch','1')}
  if(cfg.ubatch)set('--ubatch-size',String(cfg.ubatch));if(cfg.batch)set('--batch-size',String(cfg.batch));
  if(device==='cpu'&&cfg.decodeThreads){set('--threads',String(cfg.decodeThreads));if(mtp)set('--spec-draft-threads',String(cfg.decodeThreads))}
  if(device==='cpu'&&cfg.decodeMask){set('--cpu-mask',cfg.decodeMask);if(mtp)set('--spec-draft-cpu-mask',cfg.decodeMask)}
  if(mtp&&cfg.draftMax)set('--spec-draft-n-max',String(cfg.draftMax));
  if(cfg.verbose)argv.push('--verbosity','5');
  mkdirSync(this.dir+'/slots',{recursive:true});const fd=openSync(this.dir+`/${device}.log`,'a'),before=performance.now();this.phase=device+'-startup';
  const env={...process.env,LD_LIBRARY_PATH:base+'/bin:'+base+'/runtime',GGML_CPU_EXPERT_IO_PROFILE:'0',GGML_CPU_EXPERT_IO_ADVISE_MODE:'off',GGML_VK_VISIBLE_DEVICES:'0'};
  for(const k of ['GGML_SCHED_ASYNC_CPU_PROFILE','GGML_SCHED_ASYNC_CPU_TRACE','GGML_CPU_WHOLE_TOKEN_PROFILE','GGML_SPECULATIVE_PROFILE','LD_PRELOAD','OMP_PROC_BIND','OMP_PLACES','KMP_AFFINITY'])delete env[k];
  if(device==='vulkan'&&cfg.vulkanF32)env.GGML_VK_DISABLE_F16='1';
  if(cfg.preserveSwaPadding)env.LLAMA_EXPERIMENTAL_SWA_SAVE_PADDING='1';else delete env.LLAMA_EXPERIMENTAL_SWA_SAVE_PADDING;
  Object.assign(env,cfg.extraEnv??{});
  if(device==='vulkan'&&cfg.perfVulkan){env.GGML_VK_PERF_LOGGER='1';env.GGML_VK_PERF_LOGGER_FREQUENCY='1000'}
  const p=Bun.spawn(['taskset','-c','0-15',...argv],{stdout:fd,stderr:fd,env});const s={p,fd,device,port,argv};this.servers.push(s);save(this.dir+`/${device}-argv.json`,argv);
  for(let i=0;i<120;i++){if(this.error)throw Error(this.error);if(p.exitCode!==null)throw Error(`${device} startup exit ${p.exitCode}`);try{await api(`http://127.0.0.1:${port}/health`,undefined,1000);save(this.dir+`/${device}-startup.json`,{wall_ms:performance.now()-before,process:ps(p.pid),props:await api(`http://127.0.0.1:${port}/props`).then(({chat_template,...x})=>x)});return s}catch{}await sleep(1000)}throw Error('Startup timeout')
 }
 async stop(device:string){const s=this.servers.find(s=>s.device===device);if(!s)return;if(s.p.exitCode===null)s.p.kill('SIGTERM');await Promise.race([s.p.exited,sleep(10000)]);if(s.p.exitCode===null){s.p.kill('SIGKILL');await s.p.exited}closeSync(s.fd);this.servers=this.servers.filter(x=>x!==s);}
 async req(device:string,label:string,body:any,path='/completion'){
  if(path==='/completion'&&Array.isArray(body?.messages))path='/v1/chat/completions';
  if(this.error)throw Error(this.error);await this.check();this.phase=label;const port=device==='cpu'?18792:18791;const e0=await energy(),t=performance.now();const r=await api(`http://127.0.0.1:${port}${path}`,body);const wall_ms=performance.now()-t,e1=await energy();const max=Number(text('/sys/class/powercap/intel-rapl:0/max_energy_range_uj'));const joules=e0===null||e1===null?null:((e1-e0+max)%max)/1e6;
  const row={label,device,wall_ms,package_j:joules,timings:r.timings,usage:r.usage,n_written:r.n_written,n_read:r.n_read,token_hash:r.tokens?hash(r.tokens):null};save(this.dir+`/${label}.json`,{request:body,response:r,measurement:row});this.calls.push(row);console.log(JSON.stringify(row));return r
 }
 async warm(device:string){return this.req(device,device+'-warmup',{prompt:[2,105,2364,107,9259,2507,105,4368,107],n_predict:1,temperature:0,cache_prompt:false},'/completion')}
 async finish(result:any={}){
  clearInterval(this.timer);while(this.busy)await sleep(50);for(const s of this.servers){if(s.p.exitCode===null)s.p.kill('SIGTERM');await Promise.race([s.p.exited,sleep(10000)]);if(s.p.exitCode===null){s.p.kill('SIGKILL');await s.p.exited}closeSync(s.fd)}
  if(this.lockfd>=0){closeSync(this.lockfd);unlinkSync(root+'/campaign.lock')}
  save(this.dir+'/samples.json',this.samples);const r={...result,ok:!this.error&&result.ok!==false,error:this.error||result.error,config:this.cfg,calls:this.calls,thermal:{peak_c:Math.max(0,...this.samples.map(x=>x.temp_c)),hot:this.samples.some(x=>x.temp_c>=95),abort_enabled:false},resources:{peak_trial_pss_kib:Math.max(0,...this.samples.map(x=>x.servers.reduce((n,s)=>n+s.pss_kib,0))),peak_trial_rss_kib:Math.max(0,...this.samples.map(x=>x.servers.reduce((n,s)=>n+s.rss_kib,0))),peak_trial_swap_kib:Math.max(0,...this.samples.flatMap(x=>x.servers.map(s=>s.swap_kib))),min_available_kib:Math.min(...this.samples.map(x=>x.mem_available_kib)),production_swap_initial_kib:this.liveSwap,production_swap_final_kib:ps(this.livePid).swap_kib},finished_at:new Date().toISOString()};save(this.dir+'/result.json',r);console.log('FINISHED',this.name,r.ok);return r
 }
}
export const fixture=(n=4096)=>{if(n===4096||n===32768)return JSON.parse(text(`${prior}/workloads/cold-${n}.json`));const f=JSON.parse(text(`${prior}/workloads/cold-32768.json`));if(n<256||n>32768)throw Error('Invalid fixture size');f.prompt=[...f.prompt.slice(0,n-96),...f.prompt.slice(-96)];return f};
export async function screen(t:Trial){await t.begin();await t.cool();await t.start('cpu');await t.warm('cpu');if(t.cfg.warmShape)await t.req('cpu','shape-warmup',{...fixture(t.cfg.n),n_predict:1,id_slot:0});await t.cool();const f=fixture(t.cfg.n),answer=await t.req('cpu','cold',{...f,n_predict:t.cfg.predict??128,id_slot:0});const tail=(await api('http://127.0.0.1:18792/tokenize',{content:'\nContinue with the next items.',add_special:false})).tokens;const a=await t.req('cpu','append',{...f,prompt:[...f.prompt,...answer.tokens,...tail],n_predict:32,cache_prompt:true,id_slot:0});return {ok:answer.timings.prompt_n===f.prompt.length&&a.timings.prompt_n<=8&&a.timings.cache_n>=f.prompt.length}}
export async function handoff(t:Trial){await t.begin();await t.cool();await t.start('cpu');await t.warm('cpu');if(!t.cfg.sequential){await t.start('vulkan');await t.warm('vulkan');if(t.cfg.warmShape)await t.req('vulkan','shape-warmup',{...fixture(t.cfg.n),n_predict:1,id_slot:0})}await t.cool();const f=fixture(t.cfg.n),n=t.cfg.predict??128;
 const ca=await t.req('cpu','reference-first',{...f,n_predict:1,id_slot:0});const cb=await t.req('cpu','reference-rest',{...f,prompt:[...f.prompt,...ca.tokens],cache_prompt:true,n_predict:n-1,id_slot:0});const reference=[...ca.tokens,...cb.tokens];save(t.dir+'/reference-tokens.json',reference);
 const tail=(await api('http://127.0.0.1:18792/tokenize',{content:'\nContinue with the next items.',add_special:false})).tokens;const rounds=[];
 for(let i=0;i<(t.cfg.rounds??1);i++){
  if(t.cfg.sequential){await t.stop('cpu');await t.start('vulkan');await t.warm('vulkan');if(t.cfg.warmShape)await t.req('vulkan',`r${i}-shape-warmup`,{...f,n_predict:1,id_slot:0})}
  await t.cool();const start=performance.now(),g=await t.req('vulkan',`r${i}-prefill`,{...f,n_predict:1,id_slot:0});const file=`r${i}.slot`;const saved=await t.req('vulkan',`r${i}-save`,{filename:file},'/slots/0?action=save');
  if(t.cfg.sequential){await t.stop('vulkan');await t.start('cpu')}
  await t.req('cpu',`r${i}-restore`,{filename:file},'/slots/0?action=restore');
  const c=await t.req('cpu',`r${i}-decode`,{...f,prompt:[...f.prompt,...g.tokens],cache_prompt:true,n_predict:n-1,id_slot:0});const total_ms=performance.now()-start;const tokens=[...g.tokens,...c.tokens];const a=await t.req('cpu',`r${i}-append`,{...f,prompt:[...f.prompt,...tokens,...tail],cache_prompt:true,n_predict:32,id_slot:0});
  rounds.push({round:i,total_ms,kv_reused:c.timings.cache_n>=f.prompt.length,evaluated:c.timings.prompt_n,parity:hash(tokens)===hash(reference),state_bytes:saved.n_written,append_cached:a.timings.cache_n,append_evaluated:a.timings.prompt_n});save(t.dir+'/rounds.json',rounds);
 }
 return {ok:true,rounds,scope:'Diagnostic: ok means requests completed, not adoption. Parity/cache flags are separate.'}
}
if(import.meta.main){const name=process.argv[2],cfg=JSON.parse(process.argv[3]??'{}');if(name==='self-test'){
 if(hash([1,2])!==hash([1,2])||fixture().prompt.length!==4096)throw Error('Fixture/hash');const mem=num('MemAvailable: 123 kB','MemAvailable');if(mem!==123)throw Error('Parser');console.log('PASS fixture, parsers, hashing; no inference');
}else{const t=new Trial(name,cfg);let result:any={};try{result=await(cfg.kind==='handoff'?handoff(t):screen(t))}catch(e){t.error ||= String(e);console.error(e)}finally{const r=await t.finish(result);if(!r.ok)process.exitCode=1}}}
