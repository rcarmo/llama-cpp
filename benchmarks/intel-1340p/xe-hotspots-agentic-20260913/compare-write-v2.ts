/** SCRIPT_JDOC:
{"summary":"Compare frozen write-v2 matrix task results and matched work without counting faster failed workflows as gains","kind":"mixed","weight":"lightweight","role":"entrypoint"}
*/
import{existsSync,readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';import{strict as assert}from'node:assert';import{verifyRun}from'./verify-agentic-run';
const root=import.meta.dir,ids=['w2-clamp-b0','w2-clamp-c0','w2-median-c0','w2-median-b0','w2-defaults-b0','w2-defaults-c0'];
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const freeze=JSON.parse(readFileSync(root+'/write-v2-matrix-freeze.json','utf8'));
const rows=ids.filter(id=>existsSync(root+'/agentic-runs/'+id+'/result.json')).map(id=>{
 const r=verifyRun(id),dir=root+'/agentic-runs/'+id,m=JSON.parse(readFileSync(dir+'/manifest.json','utf8'));
 for(const [file,hash]of Object.entries(freeze.hashes))assert.equal(file==='agentic-session.cpp'?m.source_hash:m.harness_hashes[file],hash,`${id} freeze ${file}`);
 return{id,kind:r.kind,arm:r.arm,success:r.success,final_artifact_ok:r.final_artifact_grade?.ok??r.grades.at(-1)?.ok,failure:r.failure_reason,phases:r.phases,wall_ms:r.wall_ms,rounds:r.rounds.length,generated:r.rounds.reduce((s,x)=>s+x.generated_tokens,0),prompt_eval:r.rounds.reduce((s,x)=>s+x.evaluated_prompt_tokens,0),replay:r.rounds.reduce((s,x)=>s+x.canonical_replay_tokens,0),handoff_ms:r.rounds[0].handoff_ms,cold_ttft_s:r.rounds[0].first_token_s,tool_ms:r.rounds.reduce((s,x)=>s+(x.tool_ms||0),0),source_hash:sha(readFileSync(dir+'/fixture/src/main.ts','utf8')),native_binary:m.binary_hash,harness_hashes:m.harness_hashes,library_hash:m.library_hash,raw_hash:sha(JSON.stringify(r.rounds.map(x=>x.raw))),request_hashes:r.rounds.map((x,i)=>{const s=JSON.parse(readFileSync(dir+`/round-${i}.json`,'utf8'));return sha(JSON.stringify({messages:s.messages,tools:s.tools}));})};
});
const pairs=['clamp','median','defaults'].map(kind=>{
 const b=rows.find(r=>r.kind===kind&&r.arm==='baseline'),c=rows.find(r=>r.kind===kind&&r.arm==='candidate');if(!b||!c)return{kind,complete:false};
 const sameHarness=b.native_binary===c.native_binary&&JSON.stringify(b.harness_hashes)===JSON.stringify(c.harness_hashes);
 const equalPrompts=b.request_hashes.length===c.request_hashes.length&&b.request_hashes.every((x,i)=>x===c.request_hashes[i]);
 const equalWork=equalPrompts&&b.raw_hash===c.raw_hash&&b.generated===c.generated&&b.prompt_eval===c.prompt_eval;
 const valid=b.success&&c.success&&sameHarness;
 return{kind,complete:true,both_pass:b.success&&c.success,same_harness:sameHarness,equal_prompts:equalPrompts,equal_generated_work:equalWork,comparable:valid&&equalWork,wall_change_percent:valid?100*(c.wall_ms/b.wall_ms-1):null,handoff_change_ms:c.handoff_ms-b.handoff_ms,note:valid&&equalWork?'single matched pair; no precision claim':'different work or failed task; no speedup claim'};
});
const result={complete:rows.length===6,rows,pairs};writeFileSync(root+'/write-v2-matrix-summary.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
