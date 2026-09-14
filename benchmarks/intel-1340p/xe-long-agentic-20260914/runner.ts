/** SCRIPT_JDOC:
{"summary":"Run one admitted long multi-file agentic task on CPU-only, copied-KV or zero-copy with per-turn throughput and independent cumulative grades","kind":"mixed","weight":"heavy","role":"entrypoint"}
*/
import{readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync,statSync}from'node:fs';import{createHash}from'node:crypto';
import{Sandbox,createFixture,phases,stable}from'./tools';
const root=import.meta.dir,id=process.argv[2],arm=process.argv[3];
if(!/^long-(cpu|copy|share)-[01]$/.test(id)||!['cpu','copy','share'].includes(arm)||!id.startsWith('long-'+arm+'-'))throw Error('Exact run/arm required');
const admission=JSON.parse(readFileSync(root+'/admission.json','utf8'));if(admission.id!==id||admission.arm!==arm||!Number.isFinite(Date.parse(admission.expires))||Date.now()>Date.parse(admission.expires))throw Error('Fresh exact admission required');
const dir=root+'/runs/'+id;if(existsSync(dir))throw Error('Retained run exists');mkdirSync(dir,{recursive:true});
process.env.AGENTIC_CONTAINER_LEDGER=dir+'/containers.txt';createFixture(dir+'/fixture');const box=new Sandbox(dir+'/fixture');
const runtime='/var/home/agent/workspace/reports/xe-master-agentic-20260914',bin=root+'/bin/agentic-session',plugin=runtime+'/build-vulkan-parent/bin/libggml-vulkan.so';
const target='/var/home/agent/workspace/projects/models/gemma-4-e4b-qat-mtp/gemma-4-E4B_q4_0-it.gguf',assistant='/var/home/agent/workspace/projects/models/gemma-4-e4b-qat-mtp/gemma-4-E4B-it-qat-assistant-MTP-Q8_0.gguf';
const env={PATH:'/usr/bin:/bin',HOME:process.env.HOME!,XDG_RUNTIME_DIR:'/run/user/1001',LD_LIBRARY_PATH:runtime+'/build-cpu/bin:/var/home/agent/workspace/reports/gemma-simd-async-20260906/build-vulkan/runtime',GGML_BACKEND_PATH:arm==='cpu'?root+'/no-gpu-plugins':plugin,GGML_CPU_Q6_PAIR:'1'};
const save=(f:string,x:unknown)=>writeFileSync(dir+'/'+f,JSON.stringify(x,null,2)+'\n');
const hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const text=(p:string)=>{try{return readFileSync(p,'utf8')}catch{return''}};
const cg='/sys/fs/cgroup'+text('/proc/self/cgroup').trim().split('::')[1];
const counters=()=>Object.fromEntries(['memory.max','memory.swap.max','memory.peak','memory.swap.peak','memory.events','cpu.max','cpu.stat'].map(f=>[f,text(cg+'/'+f)]));
const initialCounters=counters();if(initialCounters['memory.max'].trim()!=='17179869184'||initialCounters['memory.swap.max'].trim()!=='0')throw Error('16GiB/ZERO swap cgroup required');
async function services(){const p=Bun.spawn(['systemctl','--user','show','llama-gemma-local-provider.service','whisper-stt.service','whisper-stt-diarizer.service','-p','Id','-p','ActiveState','-p','MainPID'],{env:{...env,DBUS_SESSION_BUS_ADDRESS:'unix:path=/run/user/1001/bus'},stdout:'pipe'});const s=await new Response(p.stdout).text();if(await p.exited)throw Error('Service inspect');return s;}
const beforeServices=await services();if((beforeServices.match(/ActiveState=inactive/g)||[]).length!==3)throw Error('Service busy');
if(arm==='cpu'&&readdirSync(runtime+'/build-cpu/bin').some(f=>f.includes('vulkan')))throw Error('CPU baseline library directory contains GPU plugin');
const freeze=JSON.parse(readFileSync(root+'/freeze.json','utf8'));
for(const[f,h]of Object.entries(freeze.files))if(hash(f)!==h)throw Error('Frozen artifact changed '+f);
for(const m of freeze.models){const s=statSync(m.path);if(s.size!==m.size||s.mtimeMs!==m.mtime_ms||s.ino!==m.ino)throw Error('Model identity changed '+m.path);}
save('manifest.json',{id,arm,admission,at:new Date().toISOString(),argv:[bin,target,assistant,arm],env,freeze,beforeServices,initialCounters,limits:{seconds:1200,memory_bytes:17179869184,swap_bytes:0,reserve_kib:6291456,rounds:48,tokens_per_round:1024,total_generated:12288,capacity:32768}});
const tool=(name:string,description:string,properties:any={},required:string[]=[])=>({type:'function',function:{name,description,parameters:{type:'object',properties,required,additionalProperties:false}}});
const tools=[tool('list_files','List the fixture files; no shell.'),tool('read_file','Read SPEC.md, visible.test.ts or a src/*.ts file.',{path:{type:'string'}},['path']),tool('search_files','Literal text search in source files.',{text:{type:'string'}},['text']),tool('write_file','Replace one whole existing src/*.ts file with complete TypeScript. Read that source and current visible.test.ts first; tests are immutable.',{path:{type:'string'},content:{type:'string'}},['path','content']),tool('run_tests','Run fixed current cumulative visible tests in an isolated sandbox.')];
const messages:any[]=[{role:'system',content:'Implement the TypeScript usage reporting library using only provided tools. Read current visible.test.ts and relevant source before writes. Fix one milestone at a time; preserve existing requirements. Write complete source files, no markdown fences. Run tests successfully before reporting completion. No shell or network is available. Keep explanations short.\n\nProject contract:\n'+readFileSync(root+'/fixtures/SPEC.md','utf8')},{role:'user',content:phases[0].prompt}];
let child:ReturnType<typeof Bun.spawn>|undefined,abort='',pending:((x:any)=>void)|undefined,reject:((e:any)=>void)|undefined,closing=false;const samples:any[]=[],rounds:any[]=[],grades:any[]=[];let generated=0,completed=0,failure='',lastArtifact:any=null;const started=performance.now();
function stop(why:string){abort||=why;if(child)try{process.kill(-child.pid,'SIGKILL')}catch{};reject?.(Error(why));}
function sample(){const status=child?text('/proc/'+child.pid+'/status'):'',available=Number(text('/proc/meminfo').match(/^MemAvailable:\s+(\d+)/m)?.[1]),swap=child?Number(status.match(/^VmSwap:\s+(\d+)/m)?.[1]):0;
 const competitors=readdirSync('/proc').filter(p=>/^\d+$/.test(p)&&['go','llama-server','whisper-cli','diar-server','ffmpeg','python','python3'].includes(text('/proc/'+p+'/comm').trim()));
 samples.push({at:new Date().toISOString(),available_kib:available,swap_kib:swap,competitors});
 if(!Number.isFinite(available)||available<6291456)stop('Host reserve');if(!Number.isFinite(swap)||swap!==0)stop('Worker swap evidence');if(competitors.length)stop('Contention '+competitors.join(','));
 if(child){const maps=text('/proc/'+child.pid+'/maps');if(maps.includes('libllama.so'))writeFileSync(dir+'/cpu-maps.txt',maps);if(maps.includes(plugin))writeFileSync(dir+'/gpu-maps.txt',maps);if(arm==='cpu'&&maps.includes('libggml-vulkan'))stop('CPU baseline loaded GPU plugin');}}
for(const signal of ['SIGTERM','SIGINT'] as const)process.on(signal,()=>stop(signal));
sample();if(abort)throw Error(abort);child=Bun.spawn([bin,target,assistant,arm],{env,stdin:'pipe',stdout:'pipe',stderr:Bun.file(dir+'/native.log'),detached:true});
const reader=(async()=>{let buf='';const decoder=new TextDecoder();for await(const part of child!.stdout){buf+=decoder.decode(part,{stream:true});if(buf.length>4*1024*1024){stop('Response byte bound');break;}let i;while((i=buf.indexOf('\n'))>=0){const line=buf.slice(0,i);buf=buf.slice(i+1);if(!pending){stop('Unsolicited native output');return;}try{const r=JSON.parse(line),resolve=pending;pending=undefined;resolve(r);}catch(e){stop('Native JSON '+String(e));}}}if(pending&&!closing)stop('Native exited before reply');})().catch(e=>stop('Reader '+String(e)));
const request=(x:any)=>new Promise<any>((resolve,reject_)=>{pending=resolve;reject=reject_;child!.stdin.write(JSON.stringify(x)+'\n');});
const timer=setInterval(()=>{try{sample()}catch(e){stop('Monitor '+String(e))}},200),deadline=setTimeout(()=>stop('Task deadline'),1170000);
try{
 for(let i=0;i<48;i++){
  const budget=Math.min(1024,12288-generated);if(budget<=0){failure='total_output_budget';break;}
  const input={id:i,messages,tools,max_tokens:budget};const t=performance.now(),r=await request(input);if(r.error)throw Error(r.error);generated+=r.generated_tokens;
  rounds.push({...r,phase:box.phase,request_wall_ms:performance.now()-t});save(`round-${i}.json`,{...input,response:r});
  if(i>0&&(r.cold||r.shared_bytes||r.copied_bytes||r.cached_tokens<=0))throw Error('Warm owner contract');
  if(i===0){if(arm==='cpu'&&(r.shared_bytes||r.copied_bytes))throw Error('CPU handoff occurred');if(arm==='copy'&&(r.shared_bytes||r.copied_bytes<=0))throw Error('Copied route mismatch');if(arm==='share'&&(r.copied_bytes||r.shared_bytes<=0))throw Error('Shared route mismatch');}
  if(r.stop==='length'){failure='round_output_budget';break;}
  const msg=r.message;if(msg.role!=='assistant')throw Error('Assistant message');messages.push(msg);
  if(msg.tool_calls?.length){if(msg.tool_calls.length>4)throw Error('Parallel tool bound');for(const call of msg.tool_calls){const t=performance.now();let result;try{result=await box.call(call.function.name,JSON.parse(call.function.arguments||'{}'));}catch(e){result={ok:false,error:String(e)};}messages.push({role:'tool',tool_call_id:call.id,name:call.function.name,content:JSON.stringify(call.function.name==='run_tests'?stable(result):result)});rounds.at(-1).tool_ms=(rounds.at(-1).tool_ms||0)+performance.now()-t;save('tools.json',box.calls);}continue;}
  const g=await box.grade();grades.push({phase:box.phase,...g});save('grades.json',grades);save(`artifact-phase-${box.phase}.json`,box.snapshot());if(!g.ok){failure='hidden_grade';break;}
  const tests=box.calls.some(x=>x.phase===box.phase&&x.name==='run_tests'&&x.result.ok);if(!tests){failure='completion_without_visible_test';break;}
  completed++;if(completed===4)break;box.next();messages.push({role:'user',content:phases[box.phase].prompt+' The visible.test.ts file now contains cumulative tests for this milestone. Read it before editing.'});
 }
 if(completed<4){failure ||= 'round_budget';lastArtifact=await box.grade();save('final-artifact-grade.json',{phase:box.phase,...lastArtifact});}
 clearInterval(timer);closing=true;child.stdin.write('{"op":"close"}\n');child.stdin.end();const rc=await child.exited;await reader;if(rc!==0)throw Error('Native exit '+rc);
}catch(e){stop(String(e));}finally{
 clearInterval(timer);clearTimeout(deadline);if(child.exitCode===null)stop('Cleanup');await child.exited;await reader;
 for(const name of text(dir+'/containers.txt').trim().split('\n').filter(n=>/^xe-agentic-test-[0-9a-f-]+$/.test(n))){const p=Bun.spawn(['podman','rm','-f','--ignore',name],{env,stdout:'ignore',stderr:'ignore'});await p.exited;}
 const afterServices=await services();if(afterServices!==beforeServices)abort||='Services changed';
 const resource=counters();save('cgroup.json',resource);if(resource['memory.swap.peak'].trim()!=='0')abort||='Cgroup swap';for(const key of ['max','oom','oom_kill'])if(resource['memory.events'].match(new RegExp('^'+key+' (\\d+)$','m'))?.[1]!=='0')abort||='Cgroup event '+key;
 const maps=text(dir+'/cpu-maps.txt');for(const f of ['libllama.so.0.4.0','libllama-common.so.0.4.0','libggml-cpu.so.0.23.0','libggml-base.so.0.23.0'])if(!maps.includes(runtime+'/build-cpu/bin/'+f))abort||='Runtime map missing '+f;
 if(arm!=='cpu'&&!text(dir+'/gpu-maps.txt').includes(plugin))abort||='GPU map missing';
 save('final-source.json',box.snapshot());save('result.json',{id,arm,abort,success:!abort&&completed===4,failure:abort||failure,completed_phases:completed,grades,final_artifact_grade:lastArtifact,rounds,tool_calls:box.calls,samples,whole_ms:performance.now()-started,services_unchanged:beforeServices===afterServices,cgroup:resource});
}
console.log(JSON.stringify({id,arm,abort,completed,failure,rounds:rounds.length,generated}));process.exitCode=abort?1:completed===4?0:2;
