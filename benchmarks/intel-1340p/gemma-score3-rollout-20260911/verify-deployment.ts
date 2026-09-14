/** SCRIPT_JDOC:
{"summary":"Verify deployed ATTN4 release, loaded identities and idle state without inference","kind":"read-only","weight":"lightweight","role":"entrypoint"}
*/
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root=import.meta.dir, release=JSON.parse(readFileSync(root+'/release.json','utf8')).release;
const cfg=JSON.parse(readFileSync(release+'/config.json','utf8'));
const info=JSON.parse(readFileSync(cfg.stateDir+'/supervisor.json','utf8'));
const text=(p:string)=>readFileSync(p,'utf8'), sha=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const assert=(v:unknown,s:string)=>{if(!v)throw Error(s)};
const unit=text('/var/home/agent/.config/systemd/user/llama-gemma-local-provider.service');
assert(unit.includes(release+'/code/main.ts '+release+'/config.json'),'Release unit');
assert(text('/proc/'+info.pid+'/cmdline').includes(release+'/code/main.ts'),'Live supervisor');
const argv=text('/proc/'+info.cpu_pid+'/cmdline').split('\0').filter(Boolean),env=text('/proc/'+info.cpu_pid+'/environ').split('\0');
assert(JSON.stringify(argv)===JSON.stringify(cfg.cpu.argv),'CPU argv');
for(const flag of ['GGML_CPU_EXPERIMENTAL_ATTN4=1','GGML_CPU_EXPERIMENTAL_SCORE4_3ROW=1','LLAMA_EXPERIMENTAL_SMALL_TARGET_BATCH=1'])assert(env.includes(flag),'CPU flag');
assert(!env.some(x=>/^(GGML_CPU_SCORE4_3ROW_TRACE|GGML_CPU_ATTN4_TRACE|GGML_CPU_SHAPE_PROFILE|GGML_CPU_WHOLE_TOKEN_PROFILE|GGML_CPU_EXPERIMENTAL_F16_PAIR)=/.test(x)),'No profiler/pair');
const maps=text('/proc/'+info.cpu_pid+'/maps'),libraries=Object.entries(cfg.cpu.hashes).map(([path,expected])=>({path,expected,actual:sha(path),mapped:maps.includes(path)}));
assert(libraries.every(x=>x.mapped&&x.actual===x.expected),'Loaded identities');
const swap=Number(text('/proc/'+info.cpu_pid+'/status').match(/^VmSwap:\s+(\d+)/m)?.[1]??Infinity);assert(swap===0,'CPU zero swap');
const api=async(p:string)=>{const r=await fetch('http://127.0.0.1:8091'+p,{signal:AbortSignal.timeout(5000)});assert(r.ok,'HTTP '+p);return r.json()};
const health=await api('/health'),status=await api('/hybrid/status'),slots=await api('/slots');
assert(!status.active&&status.queued===0&&!status.poisoned&&slots.length===2&&slots.every(s=>!s.is_processing&&s.n_ctx===131072),'Idle two slots');
for(const p of readdirSync('/proc').filter(x=>/^\d+$/.test(x))){try{assert(!text('/proc/'+p+'/cmdline').includes('--port\x0018093\x00'),'GPU orphan')}catch(e){if(e.code!=='ENOENT'&&e.code!=='ESRCH')throw e}}
const previous=JSON.parse(readFileSync(root+'/baseline/hybrid.json','utf8'));
assert(JSON.stringify(previous.gpu)===JSON.stringify(cfg.gpu),'GPU profile unchanged');
for(const n of readdirSync(release+'/code'))if(/\.(ts|js)$/.test(n)&&!['workers.ts','speech.ts'].includes(n))assert(sha(release+'/code/'+n)===sha(JSON.parse(readFileSync(root+'/release.json','utf8')).previous+'/code/'+n),'Adapter unchanged');
assert(cfg.speechMode==='stopped','Explicit stopped speech mode');
for(const [name,expected]of Object.entries(JSON.parse(readFileSync(root+'/release.json','utf8')).code_hashes))assert(sha(release+'/code/'+name)===expected,'Pinned adapter code');
const state={pass:true,verified_at:new Date().toISOString(),release,info,argv,flags:env.filter(x=>/^(GGML_CPU_EXPERIMENTAL_|LLAMA_EXPERIMENTAL_)/.test(x)),libraries,cpu_swap_kib:swap,health,status,slots,gpu_profile_unchanged:true,adapter_changes:['workers.ts','speech.ts'],speech_mode:cfg.speechMode,scope:'Read-only live state; serving/tool/cache acceptance is in production-smoke.json'};
writeFileSync(root+'/deployment-check.json',JSON.stringify(state,null,2)+'\n');console.log('PASS deployed SCORE3 identity, two idle slots, zero swap; GPU profile unchanged; stopped-speech guard active');
