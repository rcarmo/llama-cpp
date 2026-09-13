/** SCRIPT_JDOC:
{"summary":"Verify guarded Q6 two-query exactness screen and summarize reduced-row paired timings","kind":"mixed","weight":"lightweight","role":"entrypoint"}
*/
import{readFileSync,writeFileSync}from'node:fs';import{strict as assert}from'node:assert';
const root=import.meta.dir,dir=root+'/'+(process.argv[2]||'q6-pair-8t'),read=(f:string)=>readFileSync(dir+'/'+f,'utf8'),r=JSON.parse(read('result.json')),log=read('stderr.log');
assert.equal(r.rc,0);assert.equal(r.abort,'');assert.equal(r.throttle_delta,0);assert.equal(r.services_unchanged,true);assert.ok(r.samples.length>5);for(const s of r.samples){assert.ok(s.available_kib>=6*1048576);assert.equal(s.competitors.length,0);if(!s.worker_exited)assert.equal(s.swap_kib,0);assert.ok(s.cgroup.quota.startsWith('max '));}
assert.ok(log.includes('PASS q6_pair2 exact cases=20 with output stride canaries'));assert.ok(log.includes('PASS matrix rows4096 columns4 k2560 exact'));
const rows=read('stdout.csv').trim().split('\n').slice(1).map(s=>{const[repeat,arm,ms]=s.split(',');assert.ok(+ms>0);return{repeat:+repeat,arm,ms:+ms};});assert.equal(rows.length,16);for(let i=0;i<8;i++)assert.deepEqual(rows.filter(x=>x.repeat===i).map(x=>x.arm),i%2?['pair','reference']:['reference','pair']);
const b=rows.filter(x=>x.arm==='reference').map(x=>x.ms),c=rows.filter(x=>x.arm==='pair').map(x=>x.ms),median=(xs:number[])=>{xs=[...xs].sort((a,b)=>a-b);return(xs[3]+xs[4])/2;};
const result={cases:20,matrix:{rows:4096,columns:4,k:2560},threads:8,samples:16,iterations:16,reference_ms:median(b),candidate_ms:median(c),change_percent:100*(median(c)/median(b)-1),faster_pairs:c.filter((v,i)=>v<b[i]).length,ranges:{reference:[Math.min(...b),Math.max(...b)],candidate:[Math.min(...c),Math.max(...c)]},wall_ms:r.wall_ms,note:'Reduced-row screen, not full262144-row projection or model latency'};writeFileSync(root+'/q6-summary.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
