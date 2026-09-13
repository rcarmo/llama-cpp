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
assert.ok(read('evidence/tools-render-fixed.log').includes('4 pass'));assert.ok(read('evidence/tools-render-fixed.log').includes('25 expect() calls'));
console.log('PASS checkpoint: native 2-view continuation, 4 failed attempts, 2 contention exclusions; no task-success claim');
