/** SCRIPT_JDOC:
{"summary":"Run isolated eight-thread Q6 pair screen with process, cgroup, memory, swap, placement and service evidence","kind":"mixed","weight":"heavy","role":"entrypoint"}
*/
import{readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync}from'node:fs';import{createHash}from'node:crypto';import{workerStatus,counter}from'./q4-guard';
const root=import.meta.dir,id=process.argv[2]||'q6-full-8t',dir=root+'/'+id,bin=root+'/q6-build/test-q6-full';
if(!/^q6-full-8t(?:-r[1-9])?$/.test(id))throw Error('Invalid run ID');
const admission=JSON.parse(readFileSync(root+'/q6-full-admission.json','utf8'));if(admission.run_id!==id||!Number.isFinite(Date.parse(admission.expires))||Date.now()>=Date.parse(admission.expires))throw Error('Fresh exact admission required');
if(existsSync(dir))throw Error('Retained run exists');mkdirSync(dir);
const text=(p:string)=>{try{return readFileSync(p,'utf8')}catch{return''}},hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex'),save=(p:string,x:any)=>writeFileSync(dir+'/'+p,JSON.stringify(x,null,2)+'\n');
const env={PATH:'/usr/bin:/bin',HOME:process.env.HOME!,XDG_RUNTIME_DIR:'/run/user/1001',DBUS_SESSION_BUS_ADDRESS:'unix:path=/run/user/1001/bus',LD_LIBRARY_PATH:'/var/home/agent/workspace/reports/xe-in-memory-perf-20260913/release/bin:/var/home/agent/workspace/reports/gemma-simd-async-20260906/build-vulkan/runtime'};
async function services(){const c=Bun.spawn(['systemctl','--user','show','llama-gemma-local-provider.service','whisper-stt.service','whisper-stt-diarizer.service','-p','Id','-p','ActiveState','-p','MainPID'],{env,stdout:'pipe'});const s=await new Response(c.stdout).text();if(await c.exited)throw Error('Service inspect failed');return s;}
const beforeServices=await services();if((beforeServices.match(/ActiveState=inactive/g)||[]).length!==3)throw Error('Service busy');
const cg=text('/proc/self/cgroup').trim().split('::')[1],base='/sys/fs/cgroup'+cg;
const counters=()=>({cpu:text(base+'/cpu.stat'),quota:text(base+'/cpu.max'),swap:text(base+'/memory.swap.current'),memory_events:text(base+'/memory.events')});
const before=counters();if(!before.quota.startsWith('max '))throw Error('Missing or unexpected CPU quota');counter(before.cpu,'nr_throttled');
const samples:any[]=[];let abort='',child:ReturnType<typeof Bun.spawn>|undefined;
function stop(why:string){abort=abort||why;if(child)try{process.kill(-child.pid,'SIGKILL')}catch{}}
function sample(){
 const avail=Number(text('/proc/meminfo').match(/^MemAvailable:\s+(\d+)/m)?.[1]);const status=child?text(`/proc/${child.pid}/status`):'';
 const {state,exited,swap,violation}=workerStatus(status);
 const competitors=readdirSync('/proc').filter(p=>/^\d+$/.test(p)&&['go','llama-server','whisper-cli','diar-server','ffmpeg','python','python3','agentic-session'].includes(text(`/proc/${p}/comm`).trim()));
 let threads:any[]=[];if(child&&!exited)try{threads=readdirSync(`/proc/${child.pid}/task`).map(t=>({tid:t,allowed:text(`/proc/${child!.pid}/task/${t}/status`).match(/^Cpus_allowed_list:\s+(.+)/m)?.[1]}));}catch{}
 samples.push({at:new Date().toISOString(),available_kib:avail,worker_state:state,worker_exited:exited,swap_kib:swap,threads,competitors,cgroup:counters()});
 if(avail<6*1048576||!Number.isFinite(avail))stop('available memory');if(violation)stop('worker swap');if(competitors.length)stop('contention '+competitors.join(','));
 if(child&&!exited){const maps=text(`/proc/${child.pid}/maps`);if(maps)writeFileSync(dir+'/maps.txt',maps);}
}
sample();if(abort)throw Error(abort);
save('manifest.json',{id,admission,at:new Date().toISOString(),argv:[bin],env,cgroup:cg,binary_hash:hash(bin),hashes:Object.fromEntries(['q6-pair.cpp','q6-full.cpp','build-q6-full.sh','run-q6-full.ts','q4-guard.ts','launch-q6-full.sh'].map(p=>[p,hash(root+'/'+p)])),before,beforeServices});
const start=performance.now();child=Bun.spawn([bin],{env,detached:true,stdout:Bun.file(dir+'/stdout.csv'),stderr:Bun.file(dir+'/stderr.log')});
for(const sig of ['SIGTERM','SIGINT']as const)process.on(sig,()=>stop(sig));
const timer=setInterval(()=>{try{sample()}catch(e){stop('monitor '+String(e))}},50),deadline=setTimeout(()=>stop('deadline'),85000);
let rc:number;try{rc=await child.exited;}finally{clearInterval(timer);clearTimeout(deadline);}
const after=counters(),afterServices=await services();if(beforeServices!==afterServices)abort=abort||'services changed';
const throttle=counter(after.cpu,'nr_throttled')-counter(before.cpu,'nr_throttled');if(throttle)abort=abort||'CPU throttled';
save('result.json',{rc,abort,wall_ms:performance.now()-start,samples,before,after,throttle_delta:throttle,services_unchanged:beforeServices===afterServices});
console.log(JSON.stringify({id,rc,abort,samples:samples.length,throttle}));if(rc||abort)process.exitCode=1;
