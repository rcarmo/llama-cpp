/** SCRIPT_JDOC:
{"summary":"Verify retained Q6 backend off/on output hashes, dispatch trace and resource evidence","kind":"read-only","weight":"lightweight","role":"entrypoint"}
*/
import{readFileSync}from'node:fs';import{createHash}from'node:crypto';import{strict as assert}from'node:assert';
const dir=import.meta.dir+'/q6-backend-check',read=(p:string)=>readFileSync(dir+'/'+p),s=JSON.parse(read('summary.json').toString());assert.equal(s.passed,true);assert.equal(s.abort,'');assert.equal(s.services_unchanged,true);assert.equal(s.throttle_delta,0);assert.equal(s.output_sets,10);assert.ok(s.samples.length>10);
for(const p of s.samples){assert.ok(p.available>=6*1048576);assert.equal(p.competitors.length,0);if(!p.exited)assert.equal(p.swap,0);}
assert.deepEqual(s.hashes.on,s.hashes.off);for(const mode of ['off','on'])for(const[f,h]of Object.entries(s.hashes[mode]))assert.equal(createHash('sha256').update(read(mode+'/'+f)).digest('hex'),h);
assert.ok(!read('off/stderr.log').toString().includes('XE_Q6_DISPATCH'));const traces=read('on/stderr.log').toString().split('\n').filter(x=>x.startsWith('XE_Q6_DISPATCH'));assert.ok(traces.length);for(const t of traces)assert.ok(t.includes(' n=4 k=2560 '));for(const mode of ['off','on']){const lines=read(mode+'/stdout.log').toString().trim().split('\n');assert.equal(lines.length,10);for(const l of lines)assert.ok(l.includes('nmse=0 max_abs=0 exact=1'));}
console.log('PASS Q6 actual backend: 10 off/on cases bit-identical; width4-only trace; resource/service evidence');
