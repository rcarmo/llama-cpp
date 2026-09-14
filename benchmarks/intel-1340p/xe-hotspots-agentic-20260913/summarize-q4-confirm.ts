/** SCRIPT_JDOC:
{"summary":"Verify monitored eight-thread Q4 exact-dispatch screen and compute paired latency summaries","kind":"mixed","weight":"lightweight","role":"entrypoint"}
*/
import{readFileSync,writeFileSync}from'node:fs';import{strict as assert}from'node:assert';
const root=import.meta.dir,dir=root+'/'+(process.argv[2]||'q4-confirm-8t'),read=(p:string)=>readFileSync(dir+'/'+p,'utf8');
const r=JSON.parse(read('result.json')),m=JSON.parse(read('manifest.json')),log=read('stderr.log');assert.equal(r.rc,0);assert.equal(r.abort,'');assert.equal(r.throttle_delta,0);assert.equal(r.services_unchanged,true);assert.ok(r.samples.length>10);
for(const s of r.samples){assert.ok(s.available_kib>=6*1048576);assert.equal(s.competitors.length,0);if(!s.worker_exited)assert.equal(s.swap_kib,0);assert.ok(s.cgroup.quota.startsWith('max '));}
assert.equal((log.match(/^PLACEMENT /gm)||[]).length,8);assert.ok(log.includes('allowed_count=16'));
for(let f=0;f<2;f++){assert.ok(log.includes(`PASS fallback family=${f}`));for(const [a,b,c]of[[64,4,256],[65,4,288],[65,2,256],[65,3,256],[65,5,256],[10240,4,2560],[2560,4,10240]])assert.ok(log.includes(`PASS exact family=${f} m=${a} n=${b} k=${c} hits=${b===4?8:0}`));}
assert.ok(log.includes('PASS unchanged type=q5_0'));assert.ok(log.includes('PASS unchanged type=q8_0'));
const rows=read('stdout.csv').trim().split('\n').slice(1).map(l=>{const[f,m,n,k,rep,arm,ms]=l.split(',');assert.ok(+ms>0);return{family:+f,m:+m,n:+n,k:+k,rep:+rep,arm,ms:+ms};});assert.equal(rows.length,64);
const median=(x:number[])=>{x=[...x].sort((a,b)=>a-b);return(x[3]+x[4])/2;};
const groups=[];for(let family=0;family<2;family++)for(const [m,k]of[[10240,2560],[2560,10240]]){
 const rs=rows.filter(x=>x.family===family&&x.m===m&&x.k===k);assert.equal(rs.length,16);
 for(let i=0;i<8;i++)assert.deepEqual(rs.filter(x=>x.rep===i).map(x=>x.arm),i%2?['candidate','reference']:['reference','candidate']);
 const b=rs.filter(x=>x.arm==='reference').map(x=>x.ms),c=rs.filter(x=>x.arm==='candidate').map(x=>x.ms);
 groups.push({family,m,n:4,k,reference_ms:median(b),candidate_ms:median(c),change_percent:100*(median(c)/median(b)-1),faster_pairs:c.filter((v,i)=>v<b[i]).length,reference_range:[Math.min(...b),Math.max(...b)],candidate_range:[Math.min(...c),Math.max(...c)]});
}
const result={correctness_cases:18,timing_samples:rows.length,threads:8,iterations_per_sample:32,wall_ms:r.wall_ms,binary_hash:m.binary_hash,throttle_delta:r.throttle_delta,min_available_kib:Math.min(...r.samples.map(x=>x.available_kib)),groups};writeFileSync(root+'/q4-confirm-summary.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
