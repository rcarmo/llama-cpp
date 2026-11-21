import fs from 'node:fs';
const ws='/var/home/agent/workspace',run=ws+'/tmp/llama-cpp/runs/inkling-cache-serving-20261121-1dadee62b',r=ws+'/tmp/llama-cpp/runs/inkling-cache-gpu-20261121-1dadee62b';
const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
for(const suffix of ['complete','restoration'])assert(fs.readFileSync(r+'/capacity-abba.'+suffix+'.exit','utf8').trim()==='0','ABBA '+suffix);
const labels=['cap-a1','cap-b1','cap-b2','cap-a2'],rows=[],arms=[];
for(const label of labels){
 assert(fs.readFileSync(r+'/'+label+'.exit','utf8').trim()==='0',label+' failed');
 const full=JSON.parse(fs.readFileSync(r+'/'+label+'.warm-results.json'));
 assert(full.requestOutputCaps===false,'output cap');
 const config=JSON.parse(fs.readFileSync(r+'/'+label+'.config.json'));
 const variant=label.startsWith('cap-b')?'768':'256';assert(String(config.cache_mib)===variant,'capacity config mismatch');
 const fingerprints={};
 for(const step of ['cold','displace','revisit'])fingerprints[step]=JSON.parse(fs.readFileSync(r+'/'+label+'.'+step+'-rendered.json')).sha256;
 for(const observation of full.results){const j=JSON.parse(fs.readFileSync(r+'/'+label+'.'+observation.name+'.json'));assert(j.choices[0].message.content.trim()==='READY'&&j.choices[0].finish_reason==='stop','answer/EOG mismatch');assert(observation.timings.cache_n+observation.timings.prompt_n===observation.usage.prompt_tokens,'prompt accounting');rows.push({label,variant,step:observation.name,wall_ms:observation.wall_ms,cache_n:observation.timings.cache_n,prompt_n:observation.timings.prompt_n,prompt_ms:observation.timings.prompt_ms,predicted_n:observation.timings.predicted_n,decode_ms:observation.timings.predicted_ms});}
 const cancel=JSON.parse(fs.readFileSync(r+'/'+label+'.cancellation.json'));assert(cancel.afterActualDelta&&cancel.idle&&cancel.recovery==='READY','cancel/recovery');
 const samples=fs.readFileSync(r+'/'+label+'-native.monitor.csv','utf8').trim().split('\n').slice(1).map(x=>x.split(',').map(Number));
 assert(samples.length>0&&samples.every(s=>s.length===11&&s.every(Number.isFinite)&&s[2]===0&&s[4]===0&&s[1]>=2097152&&s[3]<=24964497408&&s[5]<=24964497408),'resource/swap violation');
 const kernel=fs.readFileSync(r+'/'+label+'.kernel-final.txt','utf8');assert(!/^(oom|oom_kill) [1-9]/m.test(kernel),'OOM');
 const guard=fs.readFileSync(r+'/'+label+'-native.guard-stop.txt','utf8').trim();assert(guard==='supervisor_signal','unexpected native termination');
 const step=rows.find(x=>x.label===label&&x.step==='revisit');assert(variant==='768'?step.cache_n>2000&&step.prompt_n<=8:step.cache_n===0&&step.prompt_n===2093,'revisit mechanism not reproduced');
 arms.push({label,variant,fingerprints,monitor_samples:samples.length,peak_full_backing_estimate_bytes:Math.max(...samples.map(s=>s[5])),peak_cgroup_bytes:Math.max(...samples.map(s=>s[3])),minimum_host_available_bytes:Math.min(...samples.map(s=>s[1]*1024)),cache_allocation_skipped:/prompt state size .* exceeds cache size limit/.test(fs.readFileSync(r+'/'+label+'.server.log','utf8'))});
}
for(const a of arms)assert(JSON.stringify(a.fingerprints)===JSON.stringify(arms[0].fingerprints),'unmatched rendered fixture');
const a=JSON.parse(fs.readFileSync(r+'/cap-a1.config.json')).args,b=JSON.parse(fs.readFileSync(r+'/cap-b1.config.json')).args,diff=[];
assert(a.length===b.length,'config argument count');for(let i=0;i<a.length;i++)if(a[i]!==b[i])diff.push({flag:a[i-1],before:a[i],after:b[i]});assert(JSON.stringify(diff)===JSON.stringify([{flag:'--cache-ram',before:'256',after:'768'}]),'uncontrolled factor');
const median=v=>{v.sort((a,b)=>a-b);return (v[(v.length-1)>>1]+v[v.length>>1])/2;};
const summary={};for(const variant of ['256','768']){const members=arms.filter(x=>x.variant===variant);summary[variant]={observations_per_step:2,median_revisit_wall_ms:median(rows.filter(x=>x.variant===variant&&x.step==='revisit').map(x=>x.wall_ms)),median_workflow_wall_ms:median(members.map(a=>rows.filter(x=>x.label===a.label&&x.step!=='recovery').reduce((sum,x)=>sum+x.wall_ms,0))),median_cold_wall_ms:median(rows.filter(x=>x.variant===variant&&x.step==='cold').map(x=>x.wall_ms)),median_revisit_eval_tokens:median(rows.filter(x=>x.variant===variant&&x.step==='revisit').map(x=>x.prompt_n))};}
const revisitPercent=(summary['768'].median_revisit_wall_ms/summary['256'].median_revisit_wall_ms-1)*100,workflowPercent=(summary['768'].median_workflow_wall_ms/summary['256'].median_workflow_wall_ms-1)*100;
assert(revisitPercent < -50 && workflowPercent < -20,'expected large cache benefit absent');
const result={qualified:new Date().toISOString(),source_commit:'1dadee62b291391d7b6c230fa81f04a2358c6bf2',order:labels,changes:diff,summary,revisit_wall_percent:revisitPercent,workflow_wall_percent:workflowPercent,rows,arms,context:65536,checkpoint_min_step:8192,checkpoints:2,threads:4,batch_threads:16,output_caps:false,scope:'Two observations/profile/step; cold2048-content-token prompt, dissimilar short displacement, revisit, real-delta cancel and READY recovery. Admission/performance proof for this workload; serving qualification still required.'};
fs.writeFileSync(run+'/capacity-qualified.json',JSON.stringify(result,null,2)+'\n');
const keys=Object.keys(rows[0]);fs.writeFileSync(run+'/capacity-results.csv',keys.join(',')+'\n'+rows.map(x=>keys.map(k=>x[k]).join(',')).join('\n')+'\n');
fs.writeFileSync(run+'/capacity-qualification.exit','0\n');
console.log(JSON.stringify({summary,revisit_wall_percent:revisitPercent,workflow_wall_percent:workflowPercent,changes:diff},null,2));
