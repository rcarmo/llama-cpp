/** SCRIPT_JDOC:
{"summary":"Verify resource, KV, tool and independent-grade invariants for a retained agentic run","kind":"read-only","weight":"lightweight","role":"entrypoint"}
*/
import{readFileSync}from'node:fs';import{strict as assert}from'node:assert';import{createHash}from'node:crypto';import{outcome}from'./agentic-outcome';
export function verifyRun(id:string,root=import.meta.dir){
 assert.match(id,/^[a-z0-9-]{1,40}$/);const dir=root+'/agentic-runs/'+id,load=(p:string)=>JSON.parse(readFileSync(dir+'/'+p,'utf8')),r=load('result.json'),m=load('manifest.json');
 assert.equal(m.admission.run_id,id);assert.equal(r.arm,m.arm);assert.equal(r.series,m.series);assert.equal(r.abort,'');assert.equal(r.services_unchanged,true);assert.ok(r.samples.length>10);assert.ok(r.wall_ms<600000);
 for(const s of r.samples){assert.ok(s.available_kib>=6*1048576);assert.equal(s.swap_kib,0);assert.equal(s.competitors.length,0);}
 for(const [i,x] of r.rounds.entries()){
  assert.equal(x.round,i+1);assert.equal(x.kv_pos_max+1,x.history_tokens);assert.ok(x.accepted<=x.drafted);assert.ok(x.generated_tokens<=512);
  const saved=load(`round-${i}.json`);assert.equal(saved.response.raw,x.raw);
  if(i){assert.equal(x.cold,false);assert.ok(x.cached_tokens>0);assert.equal(x.shared_bytes+x.copied_bytes,0);assert.equal(x.evaluated_prompt_tokens,x.prompt_tokens-x.cached_tokens);}else{assert.equal(x.cold,true);assert.equal(x.evaluated_prompt_tokens,x.prompt_tokens+1);assert.equal(x.copied_bytes,0);if(r.arm==='cpu')assert.equal(x.shared_bytes,0);else assert.ok(x.shared_bytes>0);}
 }
 assert.equal(r.success,outcome(r).success);assert.equal(r.failure_reason,outcome(r).failure_reason);
 if(r.success){assert.equal(r.phases,2);assert.equal(r.grades.length,2);for(let i=0;i<2;i++){assert.equal(r.grades[i].ok,true);assert.deepEqual(load(`grade-${i}.json`),r.grades[i]);}assert.ok(r.rounds.some(x=>x.phase===1&&x.cached_tokens>0));// Recovered tool errors are retained, not an automatic task failure.
 assert.ok(r.tool_calls.some(x=>x.name===r.edit_tool&&x.result?.ok));assert.ok(r.tool_calls.some(x=>x.name==='run_tests'&&x.result?.ok));}
 assert.equal(createHash('sha256').update(readFileSync(dir+'/fixture/visible.test.ts')).digest('hex'),m.test_hash);
 console.log(`PASS ${id}: ${r.rounds.length} persistent rounds, success=${r.success}, phases=${r.phases}, all guards and grades checked`);return r;
}
if(import.meta.main)verifyRun(process.argv[2]);
