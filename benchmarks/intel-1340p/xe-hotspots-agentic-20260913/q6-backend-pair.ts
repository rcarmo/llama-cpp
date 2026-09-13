/** SCRIPT_JDOC:
{"summary":"Guarded opt-in Q6 GGML backend off/on correctness controls with exact outputs and dispatch trace","kind":"mixed","weight":"heavy","role":"entrypoint"}
*/
import{mkdirSync,readFileSync,readdirSync,writeFileSync,existsSync}from'node:fs';import{createHash}from'node:crypto';import{strict as assert}from'node:assert';import{workerStatus,counter}from'./q4-guard';
const root=import.meta.dir,id='q6-backend-check',dir=root+'/'+id;
const admission=JSON.parse(readFileSync(root+'/q6-backend-admission.json','utf8'));assert.equal(admission.run_id,id);assert.ok(Date.parse(admission.expires)>Date.now());assert.ok(!existsSync(dir));mkdirSync(dir);
const text=(p:string)=>{try{return readFileSync(p,'utf8')}catch{return''}},sha=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const sysenv={PATH:'/usr/bin:/bin',HOME:process.env.HOME!,XDG_RUNTIME_DIR:'/run/user/1001',DBUS_SESSION_BUS_ADDRESS:'unix:path=/run/user/1001/bus'};
async function services(){const p=Bun.spawn(['systemctl','--user','show','llama-gemma-local-provider.service','whisper-stt.service','whisper-stt-diarizer.service','-p','Id','-p','ActiveState','-p','MainPID'],{env:sysenv,stdout:'pipe'});const s=await new Response(p.stdout).text();assert.equal(await p.exited,0);return s;}
const beforeServices=await services();assert.equal((beforeServices.match(/ActiveState=inactive/g)||[]).length,3);
const cg='/sys/fs/cgroup'+text('/proc/self/cgroup').trim().split('::')[1],beforeCpu=text(cg+'/cpu.stat');assert.ok(text(cg+'/cpu.max').startsWith('max '));
const hashes:any={},samples:any[]=[];let child:ReturnType<typeof Bun.spawn>|undefined,abort='';
function stop(reason:string){abort=abort||reason;if(child)try{process.kill(-child.pid,'SIGKILL')}catch{}}
function sample(){const available=Number(text('/proc/meminfo').match(/^MemAvailable:\s+(\d+)/m)?.[1]),s=workerStatus(child?text(`/proc/${child.pid}/status`):'');const competitors=readdirSync('/proc').filter(p=>/^\d+$/.test(p)&&['go','python','python3','llama-server','agentic-session','ffmpeg','whisper-cli'].includes(text(`/proc/${p}/comm`).trim()));samples.push({available,swap:s.swap,exited:s.exited,competitors});if(!Number.isFinite(available)||available<6*1048576)stop('host reserve');if(s.violation)stop('swap');if(competitors.length)stop('contention');}
sample();assert.equal(abort,'');const start=performance.now();let passed=false,error='';const timer=setInterval(sample,50),deadline=setTimeout(()=>stop('deadline'),40000);
for(const sig of ['SIGTERM','SIGINT']as const)process.on(sig,()=>stop(sig));
try{for(const mode of ['off','on']){
 const cwd=dir+'/'+mode;mkdirSync(cwd);const env={...sysenv,LD_LIBRARY_PATH:root+'/q6-dispatch-build/bin:/var/home/agent/workspace/reports/xe-in-memory-perf-20260913/release/bin:/var/home/agent/workspace/reports/gemma-simd-async-20260906/build-vulkan/runtime',GGML_XE_Q6_PAIR:mode==='on'?'1':'0',GGML_XE_Q6_TRACE:'1'};
 child=Bun.spawn([root+'/q6-dispatch-build/test-q6-backend'],{env,cwd,detached:true,stdout:Bun.file(cwd+'/stdout.log'),stderr:Bun.file(cwd+'/stderr.log')});assert.equal(await child.exited,0,mode);child=undefined;assert.equal(abort,'');
 hashes[mode]=Object.fromEntries(readdirSync(cwd).filter(f=>f.endsWith('.bin')).map(f=>[f,sha(cwd+'/'+f)]));assert.equal(Object.keys(hashes[mode]).length,10);
 const trace=readFileSync(cwd+'/stderr.log','utf8');if(mode==='off')assert.ok(!trace.includes('XE_Q6_DISPATCH'));else{assert.ok(trace.includes('XE_Q6_DISPATCH'));for(const line of trace.split('\n').filter(s=>s.includes('XE_Q6_DISPATCH')))assert.ok(line.includes(' n=4 k=2560 '));}
 }assert.deepEqual(hashes.on,hashes.off);passed=true;
}catch(e){error=String(e);stop(error);}finally{clearInterval(timer);clearTimeout(deadline);if(child&&child.exitCode===null)stop('cleanup');if(child)await child.exited;}
const afterServices=await services(),afterCpu=text(cg+'/cpu.stat'),throttle=counter(afterCpu,'nr_throttled')-counter(beforeCpu,'nr_throttled');passed=passed&&!abort&&!throttle&&beforeServices===afterServices;
writeFileSync(dir+'/summary.json',JSON.stringify({passed,error,abort,admission,wall_ms:performance.now()-start,samples,services_unchanged:beforeServices===afterServices,throttle_delta:throttle,binary_hash:sha(root+'/q6-dispatch-build/test-q6-backend'),library_hash:sha(root+'/q6-dispatch-build/bin/libggml-cpu.so.0.23.0'),output_sets:10,hashes},null,2)+'\n');console.log(JSON.stringify({passed,error,abort,throttle}));if(!passed)process.exitCode=1;
