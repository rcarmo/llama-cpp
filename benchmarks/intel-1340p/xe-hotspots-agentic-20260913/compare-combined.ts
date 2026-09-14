/** SCRIPT_JDOC:
{"summary":"Verify frozen combined agentic comparison and calculate paired-work medians while retaining failures","kind":"mixed","weight":"lightweight","role":"entrypoint"}
*/
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { strict as assert } from 'node:assert';
import { verifyRun } from './verify-agentic-run';
const root=import.meta.dir,freeze=JSON.parse(readFileSync(root+'/combined-freeze.json','utf8'));
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const rows=freeze.runs.filter(x=>existsSync(root+'/agentic-runs/'+x.id+'/result.json')).map(({id,arm})=>{
    const dir=root+'/agentic-runs/'+id,r=verifyRun(id),m=JSON.parse(readFileSync(dir+'/manifest.json','utf8'));
    assert.equal(r.arm,arm);assert.equal(m.binary_hash,freeze.binary);
    assert.equal(m.library_hash,freeze.libraries[arm].llama);assert.equal(m.cpu_library_hash,freeze.libraries[arm].cpu);
    assert.equal(m.env.GGML_CPU_Q6_PAIR,arm==='baseline'?'0':'1');
    for(const [f,h] of Object.entries(freeze.hashes))assert.equal(f==='agentic-session.cpp'?m.source_hash:m.harness_hashes[f],h);
    const maps=readFileSync(dir+'/maps.txt','utf8');
    assert.ok(maps.includes(arm==='baseline'?'/xe-in-memory-perf-20260913/release/bin/libllama.so.0.4.0':'/xe-hotspots-agentic-20260913/build-cpu/bin/libllama.so.0.4.0'));
    const prompts=r.rounds.map((_,i)=>{const s=JSON.parse(readFileSync(dir+`/round-${i}.json`,'utf8'));return sha(JSON.stringify({messages:s.messages,tools:s.tools}));});
    return{id,arm,success:r.success,phases:r.phases,wall_ms:r.wall_ms,handoff_ms:r.rounds[0].handoff_ms,cold_ttft_s:r.rounds[0].first_token_s,warm_native_s:r.rounds.slice(1).reduce((s,x)=>s+x.wall_s,0),warm_ttft_s:r.rounds.slice(1).reduce((s,x)=>s+x.first_token_s,0),generated:r.rounds.reduce((s,x)=>s+x.generated_tokens,0),evaluated:r.rounds.reduce((s,x)=>s+x.evaluated_prompt_tokens,0),drafted:r.rounds.reduce((s,x)=>s+x.drafted,0),accepted:r.rounds.reduce((s,x)=>s+x.accepted,0),prompts,raw_hash:sha(JSON.stringify(r.rounds.map(x=>x.raw))),source_hash:sha(readFileSync(dir+'/fixture/src/main.ts','utf8'))};
});
const complete=rows.length===4,sameWork=rows.length>0&&rows.every(r=>r.raw_hash===rows[0].raw_hash&&JSON.stringify(r.prompts)===JSON.stringify(rows[0].prompts)&&r.generated===rows[0].generated&&r.evaluated===rows[0].evaluated&&r.drafted===rows[0].drafted&&r.accepted===rows[0].accepted),qualified=complete&&sameWork&&rows.every(r=>r.success);
const median=(x:number[])=>{x=[...x].sort((a,b)=>a-b);return(x[(x.length-1)>>1]+x[x.length>>1])/2;};
const comparisons=qualified?Object.fromEntries(['wall_ms','warm_native_s','warm_ttft_s','handoff_ms','cold_ttft_s'].map(key=>{const off=rows.filter(r=>r.arm==='baseline').map(r=>r[key]),on=rows.filter(r=>r.arm==='combined').map(r=>r[key]);return[key,{baseline_median:median(off),combined_median:median(on),change_percent:100*(median(on)/median(off)-1),baseline_range:[Math.min(...off),Math.max(...off)],combined_range:[Math.min(...on),Math.max(...on)]}];})):null;
const result={complete,same_work:sameWork,qualified,rows,comparisons,note:'Two repetitions per arm, one task; combined batching+Q6 contribution, unchanged default Vulkan; not a confidence interval'};
writeFileSync(root+'/combined-summary.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
