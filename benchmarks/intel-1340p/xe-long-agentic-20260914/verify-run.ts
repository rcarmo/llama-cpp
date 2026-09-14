/** SCRIPT_JDOC:
{"summary":"Verify frozen long-task lifecycle, routing, cumulative grades and emission-based throughput from retained three-arm runs","kind":"read-only","weight":"lightweight","role":"entrypoint"}
*/
import{readFileSync}from'node:fs';import{strict as assert}from'node:assert';import{createHash}from'node:crypto';
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
export function verifyRun(id:string,root=import.meta.dir){
 assert.match(id,/^long-(cpu|copy|share)-[01]$/);const dir=root+'/runs/'+id,load=(f:string)=>JSON.parse(readFileSync(dir+'/'+f,'utf8'));
 const r=load('result.json'),m=load('manifest.json'),f=JSON.parse(readFileSync(root+'/freeze.json','utf8')),cg=load('cgroup.json');
 assert.equal(r.id,id);assert.equal(m.id,id);assert.equal(m.arm,r.arm);assert.equal(m.admission.id,id);assert.equal(m.admission.arm,r.arm);assert.equal(r.abort,'');assert.equal(r.services_unchanged,true);
 assert.deepEqual(m.freeze,f);assert.equal(m.env.GGML_CPU_Q6_PAIR,'1');assert.deepEqual(m.argv.slice(-1),[r.arm]);
 assert.ok(r.rounds.length>0&&r.rounds.length<=48);assert.ok(r.whole_ms>0&&r.whole_ms<1200000);assert.ok(r.samples.length>0);
 for(const s of r.samples){assert.ok(s.available_kib>=6291456);assert.equal(s.swap_kib,0);assert.equal(s.competitors.length,0);}
 assert.equal(cg['memory.max'].trim(),'17179869184');assert.equal(cg['memory.swap.max'].trim(),'0');assert.equal(cg['memory.swap.peak'].trim(),'0');assert.ok(Number(cg['memory.peak'])>0&&Number(cg['memory.peak'])<=17179869184);
 for(const key of ['max','oom','oom_kill'])assert.equal(cg['memory.events'].match(new RegExp('^'+key+' (\\d+)$','m'))?.[1],'0');
 const maps=readFileSync(dir+'/cpu-maps.txt','utf8');for(const p of ['libllama.so.0.4.0','libllama-common.so.0.4.0','libggml-cpu.so.0.23.0','libggml-base.so.0.23.0'])assert.ok(maps.includes('/xe-master-agentic-20260914/build-cpu/bin/'+p));
 if(r.arm==='cpu'){assert.ok(!maps.includes('libggml-vulkan'));assert.ok(!readFileSync(dir+'/native.log','utf8').includes('ggml_vulkan:'));}else assert.ok(readFileSync(dir+'/gpu-maps.txt','utf8').includes('/xe-master-agentic-20260914/build-vulkan-parent/bin/libggml-vulkan.so'));
 let emitted=0,intervalTokens=0,intervalSeconds=0,priorPhase=0;const prompts:string[]=[];
 for(const [i,x]of r.rounds.entries()){
  assert.equal(x.round,i+1);assert.equal(x.history_tokens,x.kv_pos_max+1);assert.equal(x.context_capacity,32768);assert.ok(x.phase>=priorPhase&&x.phase<=3);assert.ok(x.phase-priorPhase<=1);priorPhase=x.phase;
  assert.ok(x.generated_tokens>=0&&x.generated_tokens<=1024);assert.ok(x.accepted<=x.drafted);assert.ok(x.prompt_tokens>0&&x.prompt_tokens<=32768);
  if(i){assert.equal(x.cold,false);assert.ok(x.cached_tokens>0);assert.equal(x.shared_bytes+x.copied_bytes,0);assert.equal(x.evaluated_prompt_tokens,x.prompt_tokens-x.cached_tokens);}else{assert.equal(x.cold,true);assert.equal(x.evaluated_prompt_tokens,x.prompt_tokens+1);if(r.arm==='cpu'){assert.equal(x.shared_bytes+x.copied_bytes,0);}else if(r.arm==='copy'){assert.equal(x.shared_bytes,0);assert.ok(x.copied_bytes>0);}else{assert.equal(x.copied_bytes,0);assert.ok(x.shared_bytes>0);}}
  const saved=load(`round-${i}.json`);assert.equal(saved.response.raw,x.raw);assert.equal(saved.response.generated_tokens,x.generated_tokens);prompts.push(sha(JSON.stringify({messages:saved.messages,tools:saved.tools})));
  assert.equal(x.emission_times.length,x.generated_tokens);for(let j=0;j<x.emission_times.length;j++){assert.ok(Number.isFinite(x.emission_times[j])&&x.emission_times[j]>=0);if(j)assert.ok(x.emission_times[j]>=x.emission_times[j-1]);}
  if(x.generated_tokens>1){const span=x.emission_times.at(-1)-x.emission_times[0];assert.ok(span>0);assert.ok(Math.abs(span-x.decode_span_s)<1e-8);assert.ok(Math.abs((x.generated_tokens-1)/span-x.decode_tps)<1e-8);intervalTokens+=x.generated_tokens-1;intervalSeconds+=span;}
  emitted+=x.generated_tokens;
 }
 assert.ok(emitted<=12288);assert.ok(r.completed_phases>=0&&r.completed_phases<=4);
 const successfulGrades=r.grades.filter(x=>x.ok);assert.equal(successfulGrades.length,r.completed_phases);
 for(let phase=0;phase<r.completed_phases;phase++){assert.equal(successfulGrades[phase].phase,phase);assert.ok(r.tool_calls.some(x=>x.phase===phase&&x.name==='run_tests'&&x.result.ok));assert.ok(load(`artifact-phase-${phase}.json`));}
 assert.equal(r.success,r.completed_phases===4);if(r.success){assert.equal(r.failure,'');assert.equal(r.grades.length,4);}else assert.ok(['round_budget','round_output_budget','total_output_budget','hidden_grade','completion_without_visible_test'].includes(r.failure));
 const final=load('final-source.json');assert.deepEqual(Object.keys(final).sort(),['src/normalise.ts','src/aggregate.ts','src/report.ts','src/main.ts'].sort());
 const aggregate={id,arm:r.arm,success:r.success,failure:r.failure,completed_phases:r.completed_phases,final_current_phase_artifact_ok:r.success||r.final_artifact_grade?.ok===true,whole_s:r.whole_ms/1000,rounds:r.rounds.length,tool_calls:r.tool_calls.length,generated:emitted,evaluated:r.rounds.reduce((s,x)=>s+x.evaluated_prompt_tokens,0),drafted:r.rounds.reduce((s,x)=>s+x.drafted,0),accepted:r.rounds.reduce((s,x)=>s+x.accepted,0),decode_interval_tokens:intervalTokens,decode_interval_s:intervalSeconds,decode_tps:intervalSeconds?intervalTokens/intervalSeconds:null,effective_output_tps:emitted/(r.whole_ms/1000),first_token_s:r.rounds[0].first_token_s,cold_prefill_s:r.rounds[0].prefill_s,handoff_ms:r.rounds[0].handoff_ms,shared_bytes:r.rounds[0].shared_bytes,copied_bytes:r.rounds[0].copied_bytes,warm_native_s:r.rounds.slice(1).reduce((s,x)=>s+x.wall_s,0),tool_s:r.rounds.reduce((s,x)=>s+(x.tool_ms||0)/1000,0),max_prompt_tokens:Math.max(...r.rounds.map(x=>x.prompt_tokens)),prompts,raw_hash:sha(JSON.stringify(r.rounds.map(x=>x.raw))),source_hash:sha(JSON.stringify(final)),min_available_kib:Math.min(...r.samples.map(x=>x.available_kib)),memory_peak_bytes:Number(cg['memory.peak'])};
 console.log(`PASS ${id}: ${r.completed_phases}/4 milestones;${r.rounds.length} rounds;${emitted} output tokens;routing/maps/guards/token timing checked`);return aggregate;
}
if(import.meta.main)console.log(JSON.stringify(verifyRun(process.argv[2]),null,2));
