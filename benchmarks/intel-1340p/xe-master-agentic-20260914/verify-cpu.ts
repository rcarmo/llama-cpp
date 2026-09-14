/** SCRIPT_JDOC:
{"summary":"Verify current-master CPU CTest completion, vocabulary prefix invariants and unchanged built identities while reporting cross-version prompt differences","kind":"read-only","weight":"lightweight","role":"entrypoint"}
*/
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
const root=import.meta.dir,prior=root+'/../xe-hotspots-agentic-20260913';
const log=readFileSync(root+'/evidence/cpu-check.log','utf8');
assert.ok(log.includes('100% tests passed, 0 tests failed out of 4'));
assert.ok(log.includes('c67cf18881a9276643408605b27bb9fa7d53c24b992f0b58eceee3692d97325b'));
const names=['pilot','exclusive','followup'];
for(const name of names){
 const r=JSON.parse(readFileSync(root+`/evidence/render-${name}.json`,'utf8')),old=JSON.parse(readFileSync(prior+`/evidence/render-${name}-fixed.json`,'utf8'));
 assert.equal(r.passed,true);assert.equal(r.append_mutations_rejected,4);assert.equal(r.rows.length,old.rows.length);
 for(const row of r.rows){assert.equal(row.ok,true);assert.ok(row.protected<=row.tokens);assert.ok(row.lcp>=row.prior_protected);assert.ok(Number.isInteger(row.tokens)&&row.tokens>0);}
 const log=readFileSync(root+`/evidence/render-${name}.log`,'utf8');assert.ok(!log.includes('ggml_vulkan:'));
 console.log(JSON.stringify({name,prefixes:r.rows.length,mutations_rejected:r.append_mutations_rejected,token_geometry_matches_previous:JSON.stringify(r.rows.map(x=>[x.tokens,x.lcp,x.protected]))===JSON.stringify(old.rows.map(x=>[x.tokens,x.lcp,x.protected]))}));
}
for(const line of readFileSync(root+'/evidence/cpu-build-identity.sha256','utf8').trim().split('\n')){
 const m=line.match(/^([0-9a-f]{64})  (.+)$/);assert.ok(m);assert.equal(createHash('sha256').update(readFileSync(m[2])).digest('hex'),m[1]);
}
console.log('PASS current-master4 CPU CTests,21 rendered prefixes,12 mutation rejections and6 built identities. No trained/GPU qualification.');
