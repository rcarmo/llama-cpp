/** SCRIPT_JDOC:
{"summary":"Verify retained native handoff, failed agentic traces and renderer-correction evidence without model execution","kind":"read-only","weight":"lightweight","role":"entrypoint"}
*/
import{readFileSync}from'node:fs';import{createHash}from'node:crypto';import{strict as assert}from'node:assert';
const root=import.meta.dir,read=(p:string)=>readFileSync(root+'/'+p,'utf8'),json=(p:string)=>JSON.parse(read(p));
await import('./verify-render');
const native=json('batched-native/result.json');assert.equal(native.rc,0);assert.equal(native.abort,'');assert.equal(native.services_unchanged,true);assert.ok(read('batched-native/stderr.log').includes('BATCHED views=2'));assert.ok(read('batched-native/stdout.log').includes('exact CPU continuation against same-state copied reference'));
for(const sample of native.samples){assert.ok(sample.available>=6*1048576);assert.equal(sample.contention.length,0);for(const p of sample.own)assert.equal(p.swap,0);}
const names=['pilot','corrected','retry','exclusive'];let interrupted=0;
for(const name of names){
 const r=json(`agentic-runs/clamp-candidate-${name}/result.json`);assert.equal(r.success,false);assert.equal(r.phases,0);assert.equal(r.grades.length,0);assert.equal(r.services_unchanged,true);assert.ok(r.samples.length>5);
 const competing=r.samples.some((x:any)=>x.competitors.length);if(competing)interrupted++;
 for(const s of r.samples){assert.ok(s.available_kib>=6*1048576);assert.equal(s.swap_kib,0);}
 const good=r.rounds.filter((x:any)=>!x.error);assert.ok(good.length>=2);
 for(let i=0;i<good.length;i++){
  const x=good[i];assert.equal(x.round,i+1);assert.equal(x.history_tokens,x.kv_pos_max+1);assert.ok(x.accepted<=x.drafted);
  if(i){assert.equal(x.cold,false);assert.ok(x.cached_tokens>0);assert.equal(x.shared_bytes+x.copied_bytes,0);assert.equal(x.evaluated_prompt_tokens,x.prompt_tokens-x.cached_tokens);}else{assert.equal(x.cold,true);assert.ok(x.shared_bytes>0);assert.equal(x.copied_bytes,0);}
 }
 if(name==='exclusive'){assert.equal(competing,false);assert.ok(r.abort.includes('changed committed input prefix'));assert.equal(good.at(-1).canonical_replay_tokens,329);const manifest=json(`agentic-runs/clamp-candidate-${name}/manifest.json`);assert.equal(createHash('sha256').update(read('source-history/agentic-session-exclusive.cpp')).digest('hex'),manifest.source_hash);}
 if(name==='pilot')assert.ok(r.abort.includes('rewrote too much cached prefix'));
 console.log(`PASS retained ${name}: ${good.length} completed rounds; ${competing?'contention excluded':'harness failure retained'}`);
}
assert.equal(interrupted,2);
const boundary=json('agentic-runs/clamp-candidate-boundary/result.json');assert.equal(boundary.abort,'');assert.equal(boundary.success,false);assert.equal(boundary.rounds.length,10);assert.equal(boundary.phases,0);assert.equal(boundary.services_unchanged,true);
for(const s of boundary.samples){assert.equal(s.competitors.length,0);assert.equal(s.swap_kib,0);assert.ok(s.available_kib>=6*1048576);}
for(const [i,x] of boundary.rounds.entries()){assert.equal(x.stop,'eog');assert.equal(x.kv_pos_max+1,x.history_tokens);if(i){assert.ok(x.cached_tokens>0);assert.equal(x.shared_bytes+x.copied_bytes,0);assert.equal(x.evaluated_prompt_tokens,x.prompt_tokens-x.cached_tokens);}}
const grade=json('evidence/boundary-final-grade.json');assert.equal(grade.result.ok,false);assert.equal(grade.immutable_original,true);assert.equal(grade.source_sha256,createHash('sha256').update(read('agentic-runs/clamp-candidate-boundary/fixture/src/main.ts')).digest('hex'));assert.ok(grade.result.stderr.includes('Unexpected export'));
console.log('PASS corrected boundary pilot: 10 uninterrupted rounds, task failed, immutable artifact rejected independently');
assert.ok(read('evidence/tools-render-fixed.log').includes('4 pass'));assert.ok(read('evidence/tools-render-fixed.log').includes('25 expect() calls'));
const base=json('agentic-runs/clamp-baseline-control/result.json');assert.equal(base.abort,'worker swap guard');assert.equal(base.success,false);assert.equal(base.rounds.length,5);assert.equal(base.rounds.at(-1).stop,'length');assert.equal(base.final_artifact_grade.ok,false);assert.equal(base.samples.at(-1).swap_kib,null);assert.ok(base.samples.slice(0,-1).every((x:any)=>x.swap_kib===0));assert.ok(base.samples.every((x:any)=>x.competitors.length===0));assert.equal(base.services_unchanged,true);
const bm=json('agentic-runs/clamp-baseline-control/manifest.json');assert.equal(bm.harness_hashes['agentic-runner.ts'],createHash('sha256').update(read('source-history/agentic-runner-baseline.ts')).digest('hex'));
console.log('PASS baseline control: output cap/artifact failure and terminal sampling race retained separately');
const cpu=json('agentic-runs/clamp-cpu-control/result.json');assert.equal(cpu.arm,'cpu');assert.equal(cpu.abort,'');assert.equal(cpu.failure_reason,'output_budget_exhausted');assert.equal(cpu.exit_code,2);assert.equal(cpu.success,false);assert.equal(cpu.rounds.length,6);assert.equal(cpu.final_artifact_grade.ok,false);assert.equal(cpu.services_unchanged,true);
for(const x of cpu.rounds){assert.equal(x.shared_bytes+x.copied_bytes,0);assert.equal(x.kv_pos_max+1,x.history_tokens);}
assert.ok(cpu.samples.every((x:any)=>x.swap_kib===0&&x.competitors.length===0&&x.available_kib>=6*1048576));
console.log('PASS CPU-only control: six rounds, output-budget task failure, zero transfer/swap and clean native shutdown');
console.log('PASS checkpoint: native 2-view continuation, 7 retained attempts, 2 contention exclusions; no task-success claim');
