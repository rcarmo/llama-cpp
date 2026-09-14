/** SCRIPT_JDOC:
{"summary":"Verify full-shape synthetic Q6 projection exactness/resources and retain all paired timings","kind":"mixed","weight":"lightweight","role":"entrypoint"}
*/
import{readFileSync,writeFileSync}from'node:fs';import{strict as assert}from'node:assert';
const root=import.meta.dir,dir=root+'/q6-full-8t',r=JSON.parse(readFileSync(dir+'/result.json','utf8')),log=readFileSync(dir+'/stderr.log','utf8');
assert.equal(r.rc,0);assert.equal(r.abort,'');assert.equal(r.throttle_delta,0);assert.equal(r.services_unchanged,true);assert.ok(log.includes('rows=262144 columns=4 k=2560 weights=550502400 outputs=1048576'));
for(const s of r.samples){assert.ok(s.available_kib>=6*1048576);assert.equal(s.competitors.length,0);if(!s.worker_exited)assert.equal(s.swap_kib,0);assert.ok(s.cgroup.quota.startsWith('max '));}
const rows=readFileSync(dir+'/stdout.csv','utf8').trim().split('\n').slice(1).map(s=>{const[repeat,arm,ms]=s.split(',');assert.ok(+ms>0);return{repeat:+repeat,arm,ms:+ms};});assert.equal(rows.length,16);for(let i=0;i<8;i++)assert.deepEqual(rows.filter(x=>x.repeat===i).map(x=>x.arm),i%2?['pair','reference']:['reference','pair']);
const b=rows.filter(x=>x.arm==='reference').map(x=>x.ms),c=rows.filter(x=>x.arm==='pair').map(x=>x.ms),median=(xs:number[])=>{xs=[...xs].sort((a,b)=>a-b);return(xs[3]+xs[4])/2;};
const result={rows:262144,columns:4,k:2560,threads:8,reference_ms:median(b),candidate_ms:median(c),change_percent:100*(median(c)/median(b)-1),faster_pairs:c.filter((v,i)=>v<b[i]).length,raw_pairs:rows,note:'Synthetic full projection, not GGML dispatcher/model latency'};writeFileSync(root+'/q6-full-summary.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
