/** SCRIPT_JDOC:
{"summary":"Verify trained Q6 dispatch proof from raw or losslessly compressed trace and matched ABBA evidence","kind":"read-only","weight":"lightweight","role":"entrypoint"}
*/
import{readFileSync,existsSync}from'node:fs';import{gunzipSync}from'node:zlib';import{strict as assert}from'node:assert';import{verifyRun}from'./verify-agentic-run';
const root=import.meta.dir,id='q6-trained-trace',dir=root+'/agentic-runs/'+id,r=verifyRun(id);assert.equal(r.success,true);const log=existsSync(dir+'/native.log')?readFileSync(dir+'/native.log','utf8'):gunzipSync(readFileSync(dir+'/native.log.gz')).toString();assert.ok(log.includes('XE_Q6_DISPATCH m=262144 n=4 k=2560 '));const maps=readFileSync(dir+'/maps.txt','utf8');assert.ok(maps.includes('/q6-dispatch-build/bin/libggml-cpu.so.0.23.0'));for(const rid of ['q6-clamp-off0','q6-clamp-on0','q6-clamp-on1','q6-clamp-off1'])verifyRun(rid);
const s=JSON.parse(readFileSync(root+'/q6-agentic-summary.json','utf8'));assert.equal(s.complete,true);assert.equal(s.same_work,true);assert.equal(s.qualified,true);console.log('PASS trained Q6 exact dispatch/grades and four matched unprofiled tasks');
