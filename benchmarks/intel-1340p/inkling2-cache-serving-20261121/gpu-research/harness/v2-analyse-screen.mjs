import fs from 'node:fs';
const run='/var/home/agent/workspace/tmp/llama-cpp/runs/inkling-gpu-cache768-20261121-1dadee62b/v2';
const phase=process.argv[2]||'screen-v2',labels=process.argv.slice(3);if(!labels.length)labels.push('g768-512-a2','g768-512-b2');
const assert=(ok,msg)=>{if(!ok)throw Error(msg);},read=f=>fs.readFileSync(run+'/'+f,'utf8');
for(const key of ['complete','restoration'])assert(read(phase+'.'+key+'.exit').trim()==='0','Unsuccessful phase '+key);
const median=a=>{a=[...a].sort((a,b)=>a-b);return a.length%2?a[a.length>>1]:(a[a.length/2-1]+a[a.length/2])/2;};
const rows=[],arms=[];
for(const label of labels){
 assert(/^[a-z0-9-]+$/.test(label),'label');
 for(const file of [label+'.exit',label+'-native.exit'])assert(read(file).trim()==='0',file);
 assert(!fs.existsSync(run+'/'+label+'-native.guard-stop.txt'),'Guarded '+label);
 const log=read(label+'.native.log').split('\n').map(s=>s.replace(/^.*? (stdout|stderr) [FP] /,'')).join('\n');
 const fields=line=>Object.fromEntries([...line.matchAll(/(\w+)=([^\s]+)/g)].map(m=>[m[1],m[2]]));
 const config=fields(log.match(/^BENCH_CONFIG .+$/m)?.[0]||'');
 assert(config.prompt&&config.reps==='2'&&config.threads==='4'&&config.batch_threads==='16'&&config.ubatch==='128'&&config.fa==='0'&&config.pool==='3','Settings '+label);
 assert(log.includes('WORKLOAD_WARMUP_COMPLETE')&&log.includes('RESULT PASS finite replay'),'Missing completion '+label);
 const token=fields(log.match(/^TOKEN_STREAM_HASH .+$/m)?.[0]||'');assert(token.hash&&token.tokens,'Token hash');
 const matches=[...log.matchAll(/^BENCH_RESULT .+$/gm)];assert(matches.length===2,'Two repetitions '+label);
 const hashes=[...log.matchAll(/^LOGITS_HASH rep=(\d+) hash=(\d+)/gm)].map(m=>({rep:Number(m[1]),hash:m[2]}));assert(hashes.length===2,'Logit hashes');
 for(const m of matches){const f=fields(m[0]);const row={label,rep:Number(f.rep),prompt:Number(f.prompt),generated:Number(f.generated),pp_ms:Number(f.pp_ms),tg_ms:Number(f.tg_ms),pp_tps:Number(f.pp_tps),tg_tps:Number(f.tg_tps),wall_ms:Number(f.wall_ms),argmax_hash:f.hash,logits_hash:hashes.find(h=>h.rep===Number(f.rep))?.hash,finite:f.finite==='1'};assert(row.finite&&row.prompt===Number(config.prompt)&&row.generated===64&&[row.pp_ms,row.tg_ms,row.wall_ms].every(n=>Number.isFinite(n)&&n>0),'Invalid row');rows.push(row);}
 const monitor=read(label+'-native.monitor.csv').trim().split('\n').slice(1).map(l=>l.split(',').map(Number));assert(monitor.length>0&&monitor.every(s=>s.length===11&&s.every(Number.isFinite)&&!s[2]&&!s[4]&&s[1]>=2097152&&s[3]<=24964497408&&s[5]<=24964497408),'Resources '+label);
 const cg=read(label+'-native.cgroup.txt');assert(!/^(oom|oom_kill) [1-9]/m.test(cg),'OOM');
 const vocab=Number(log.match(/MODEL_ID layers=\d+ vocab=(\d+)/)?.[1]);assert(fs.statSync(run+'/'+label+'.logits.f32').size===vocab*8*4,'Dump size');
 const own=rows.filter(x=>x.label===label),c=JSON.parse(read(label+'.container-after.json'))[0];
 const env=Object.fromEntries(c.Config.Env.map(s=>{const p=s.indexOf('=');return[s.slice(0,p),s.slice(p+1)];}));
 assert(!env.MOE_TRACE_PHASE&&!env.GGML_SCHED_DEBUG&&env.GGML_SCHED_PREFETCH_EXPERTS==='0'&&env.GGML_OP_OFFLOAD_MIN_BATCH==='32','Instrumentation/policy');
 arms.push({label,token_stream_hash:token.hash,tokens:Number(token.tokens),config,pattern:env.GGML_VK_CPU_PREFILL_PATTERN,within_arm_repeat_argmax_equal:own[0].argmax_hash===own[1].argmax_hash,within_arm_repeat_logits_equal:own[0].logits_hash===own[1].logits_hash,median_pp_tps:median(own.map(x=>x.pp_tps)),median_tg_tps:median(own.map(x=>x.tg_tps)),median_wall_ms:median(own.map(x=>x.wall_ms)),peak_full_backing_estimate_bytes:Math.max(...monitor.map(s=>s[5])),peak_gpu_accounted_bytes:Math.max(...monitor.map(s=>s[8])),peak_cgroup_bytes:Math.max(...monitor.map(s=>s[3])),minimum_host_available_bytes:Math.min(...monitor.map(s=>s[1]*1024)),peak_gpu_engine_ns:Math.max(...monitor.map(s=>s[9])),cpu_nr_throttled:Number(cg.match(/^nr_throttled (\d+)/m)?.[1]),cpu_state_allocations:log.split('\n').filter(l=>/CPU (KV|RS) buffer size/.test(l))});
}
assert(arms.every(x=>x.token_stream_hash===arms[0].token_stream_hash&&x.tokens===arms[0].tokens&&JSON.stringify(x.config)===JSON.stringify(arms[0].config)),'Mismatched fixtures/settings');
const [a,b]=arms,comparison=arms.length===2?{prefill_tps_percent:(b.median_pp_tps/a.median_pp_tps-1)*100,decode_tps_percent:(b.median_tg_tps/a.median_tg_tps-1)*100,whole_replay_wall_percent:(b.median_wall_ms/a.median_wall_ms-1)*100}:null;
const result={generated:new Date().toISOString(),phase,runtime_code_commit:'1dadee62b291391d7b6c230fa81f04a2358c6bf2',accepted_parent_config_commit:'6543c98c14284e48816d7a4bcc1f719289986155',kind:'uncounterbalanced feasibility screen',warmup_excluded:true,observations_per_arm:2,promotion_qualified:false,restored_cache768:true,arms,comparison,rows,limits:['Fixed-token teacher-forced replay, not independent coding quality.','Eight dump frames support numerical diagnostics only.','AB order/two repetitions per process do not establish counterbalanced performance.','Startup, shader warmup and full-vocabulary checks outside tg_ms are not decode kernel time.','No populated64K, crash recovery or serving GPU qualification.']};
fs.writeFileSync(run+'/'+phase+'.results.json',JSON.stringify(result,null,2)+'\n');
const columns=Object.keys(rows[0]);fs.writeFileSync(run+'/'+phase+'.results.csv',columns.join(',')+'\n'+rows.map(row=>columns.map(k=>row[k]).join(',')).join('\n')+'\n');
console.log(JSON.stringify({phase,arms,comparison},null,2));
