/** SCRIPT_JDOC:
{"summary":"Verify frozen Q6 ABBA agentic work and summarize OFF/ON timing without treating failures as wins","kind":"mixed","weight":"lightweight","role":"entrypoint"}
*/
import{readFileSync,writeFileSync,existsSync}from'node:fs';import{createHash}from'node:crypto';import{strict as assert}from'node:assert';import{verifyRun}from'./verify-agentic-run';
const root=import.meta.dir,order=JSON.parse(readFileSync(root+'/q6-timing-order.json','utf8')),freeze=JSON.parse(readFileSync(root+'/q6-timing-freeze.json','utf8')),sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const rows=order.runs.filter(x=>existsSync(root+'/agentic-runs/'+x.id+'/result.json')).map(({id,arm})=>{
 const dir=root+'/agentic-runs/'+id,r=verifyRun(id),m=JSON.parse(readFileSync(dir+'/manifest.json','utf8'));
 assert.equal(r.arm,arm);assert.equal(m.cpu_library_hash,freeze.cpu_library_hash);assert.equal(m.env.GGML_XE_Q6_TRACE,'0');assert.equal(m.env.GGML_XE_Q6_PAIR,arm==='q6on'?'1':'0');
 for(const[f,h]of Object.entries(freeze.hashes))assert.equal(f==='agentic-session.cpp'?m.source_hash:m.harness_hashes[f],h);
 assert.ok(!readFileSync(dir+'/native.log','utf8').includes('XE_Q6_DISPATCH'));
 const prompts=r.rounds.map((_,i)=>{const s=JSON.parse(readFileSync(dir+`/round-${i}.json`,'utf8'));return sha(JSON.stringify({messages:s.messages,tools:s.tools}));});
 return{id,arm,success:r.success,phases:r.phases,wall_ms:r.wall_ms,handoff_ms:r.rounds[0].handoff_ms,cold_ttft_s:r.rounds[0].first_token_s,warm_native_s:r.rounds.slice(1).reduce((s,x)=>s+x.wall_s,0),warm_ttft_s:r.rounds.slice(1).reduce((s,x)=>s+x.first_token_s,0),generated:r.rounds.reduce((s,x)=>s+x.generated_tokens,0),evaluated:r.rounds.reduce((s,x)=>s+x.evaluated_prompt_tokens,0),drafted:r.rounds.reduce((s,x)=>s+x.drafted,0),accepted:r.rounds.reduce((s,x)=>s+x.accepted,0),prompts,raw_hash:sha(JSON.stringify(r.rounds.map(x=>x.raw))),source_hash:sha(readFileSync(dir+'/fixture/src/main.ts','utf8'))};
});
const complete=rows.length===4,sameWork=rows.length>0&&rows.every(r=>r.raw_hash===rows[0].raw_hash&&JSON.stringify(r.prompts)===JSON.stringify(rows[0].prompts)&&r.generated===rows[0].generated&&r.evaluated===rows[0].evaluated&&r.drafted===rows[0].drafted&&r.accepted===rows[0].accepted),qualified=complete&&sameWork&&rows.every(r=>r.success);
const median=(xs:number[])=>{xs=[...xs].sort((a,b)=>a-b);return(xs[(xs.length-1)>>1]+xs[xs.length>>1])/2;};
const comparisons=qualified?Object.fromEntries(['wall_ms','warm_native_s','warm_ttft_s','handoff_ms','cold_ttft_s'].map(key=>{const off=rows.filter(r=>r.arm==='q6off').map(r=>r[key]),on=rows.filter(r=>r.arm==='q6on').map(r=>r[key]);return[key,{off_median:median(off),on_median:median(on),change_percent:100*(median(on)/median(off)-1),off_range:[Math.min(...off),Math.max(...off)],on_range:[Math.min(...on),Math.max(...on)]}];})):null;
const result={complete,same_work:sameWork,qualified,rows,comparisons,note:'Two repetitions per arm; exploratory ABBA confirmation, not a confidence interval'};writeFileSync(root+'/q6-agentic-summary.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
