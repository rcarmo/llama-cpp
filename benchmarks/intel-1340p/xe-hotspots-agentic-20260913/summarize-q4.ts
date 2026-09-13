/** SCRIPT_JDOC:
{"summary":"Verify exact-shape Q4 screen rows and summarise two-thread isolated tile timings without model claims","kind":"mixed","weight":"lightweight","role":"entrypoint"}
*/
import{readFileSync,writeFileSync}from'node:fs';import{strict as assert}from'node:assert';
const root=import.meta.dir,text=readFileSync(root+'/evidence/q4-screen.log','utf8');
assert.ok(text.includes('PASS width1 unchanged fallback'));const lines=text.trim().split('\n');const rows=lines.filter(x=>/^\d+,/.test(x)).map(line=>{const[m,n,k,rep,arm,ms]=line.split(',');assert.ok(['4x2','2x4'].includes(arm));assert.ok(Number(ms)>0);return{m:+m,n:+n,k:+k,rep:+rep,arm,ms:+ms};});
const shapes=[[64,4,256],[65,4,288],[65,2,256],[65,3,256],[65,5,256],[10240,4,2560],[2560,4,10240]];
assert.equal(rows.length,shapes.length*16);
const median=(a:number[])=>{a=[...a].sort((a,b)=>a-b);return(a[(a.length-1)>>1]+a[a.length>>1])/2;};
const results=shapes.map(([m,n,k])=>{
 assert.ok(text.includes(`PASS exact shape ${m}x${n}x${k}`));const selected=rows.filter(x=>x.m===m&&x.n===n&&x.k===k);assert.equal(selected.length,16);
 for(let rep=0;rep<8;rep++){const pair=selected.filter(x=>x.rep===rep);assert.equal(pair.length,2);assert.deepEqual(pair.map(x=>x.arm),rep%2?['2x4','4x2']:['4x2','2x4']);}
 const arms=['4x2','2x4'].map(arm=>selected.filter(x=>x.arm===arm).map(x=>x.ms));
 const a=median(arms[0]),b=median(arms[1]);return{m,n,k,reference_ms:a,candidate_ms:b,delta_ms:b-a,latency_change_percent:100*(b/a-1),reference_range:[Math.min(...arms[0]),Math.max(...arms[0])],candidate_range:[Math.min(...arms[1]),Math.max(...arms[1])],candidate_faster_pairs:Array.from({length:8},(_,i)=>arms[1][i]<arms[0][i]).filter(Boolean).length};
});
const result={scope:'Exploratory 2-thread CPU-quota screen; no worker/host monitor or throttle/placement evidence, not qualified inference timing',checks:8,samples:rows.length,iterations_per_sample:32,results};
writeFileSync(root+'/q4-summary.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
