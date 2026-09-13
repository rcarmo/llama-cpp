/** SCRIPT_JDOC:
{"summary":"Check vocabulary-only regression outputs for Gemma tool-turn reopening and append-only messages","kind":"read-only","weight":"lightweight","role":"entrypoint"}
*/
import{readFileSync}from'node:fs';import{strict as assert}from'node:assert';
const root=import.meta.dir;
for(const name of ['pilot','exclusive','followup']){
 const result=JSON.parse(readFileSync(`${root}/evidence/render-${name}-fixed.json`,'utf8'));
 assert.equal(result.passed,true,name);assert.equal(result.append_mutations_rejected,4,name);
 assert.ok(result.rows.length>=6,name);for(const r of result.rows){assert.equal(r.ok,true);assert.ok(r.protected<=r.tokens);assert.ok(r.lcp>=r.prior_protected);}
 if(name==='exclusive'){const last=result.rows.at(-1);assert.equal(last.messages,14);assert.equal(last.lcp,1164);assert.equal(last.prior_protected,1164);}
 console.log(`PASS ${name}: ${result.rows.length} rendered prefixes, four append mutations rejected`);
}
const old=JSON.parse(readFileSync(root+'/evidence/render-exclusive-diagnostic.json','utf8'));assert.equal(old.passed,false);assert.equal(old.rows.at(-1).lcp,1164);assert.equal(old.rows.at(-1).prior_protected,1166);
console.log('PASS original exclusive failure retained (1164 < 1166)');
