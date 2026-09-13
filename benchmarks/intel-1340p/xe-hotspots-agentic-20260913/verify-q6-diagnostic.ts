/** SCRIPT_JDOC:
{"summary":"Verify preserved failed Q6 reference fixture and bit-identical replay after CPU table initialisation","kind":"read-only","weight":"lightweight","role":"entrypoint"}
*/
import{readFileSync}from'node:fs';import{createHash}from'node:crypto';import{strict as assert}from'node:assert';
const root=import.meta.dir,read=(p:string)=>readFileSync(root+'/'+p),sha=(p:string)=>createHash('sha256').update(read(p)).digest('hex');
const first=JSON.parse(read('q6-pair-8t/result.json').toString()),manifest=JSON.parse(read('q6-pair-8t/manifest.json').toString());assert.equal(first.rc,134);assert.equal(first.abort,'');assert.equal(first.services_unchanged,true);assert.equal(first.throttle_delta,0);assert.ok(read('q6-pair-8t/stderr.log').toString().includes('memcmp(a,b,sizeof(a))'));
assert.equal(sha('source-history/q6-first/q6-pair.cpp'),manifest.hashes['q6-pair.cpp']);assert.equal(sha('source-history/q6-first/q6-native.cpp'),manifest.hashes['q6-native.cpp']);
const log=read('q6-mismatch-diagnostic/diagnostic.log').toString();assert.ok(log.includes('MISMATCH n=256 family=1 a=0x0p+0,0x0p+0'));assert.ok(log.includes('AFTER_CPU_INIT a=-0x1.4c3e26p+4,-0x1.7610bcp+3 candidate=-0x1.4c3e26p+4,-0x1.7610bcp+3 exact=1'));assert.equal(read('q6-mismatch-diagnostic/exit-code.txt').toString().trim(),'3');
for(const line of read('q6-mismatch-diagnostic/input.sha256').toString().trim().split('\n')){const[h,p]=line.split(/\s+/);assert.equal(sha('q6-mismatch-diagnostic/'+p),h);}
console.log('PASS retained Q6 assertion/source identity, exact offending bytes, and post-initialisation reference equality; no timing result');
