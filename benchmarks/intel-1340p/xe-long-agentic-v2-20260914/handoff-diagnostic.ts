/** SCRIPT_JDOC:
{"summary":"Extract cold-prefix and transfer-only comparisons without crediting unequal or failed whole tasks as speedups","kind":"mixed","weight":"lightweight","role":"entrypoint"}
*/
import{readFileSync,writeFileSync,existsSync}from'node:fs';import{createHash}from'node:crypto';
const root=import.meta.dir,arms=['cpu','copy','share'];
const rows=arms.filter(a=>existsSync(root+'/runs/long2-'+a+'-0/result.json')).map(arm=>{
 const dir=root+'/runs/long2-'+arm+'-0',r=JSON.parse(readFileSync(dir+'/result.json','utf8')),p=JSON.parse(readFileSync(dir+'/round-0.json','utf8')),x=r.rounds[0];
 return{arm,prompt_hash:createHash('sha256').update(JSON.stringify({messages:p.messages,tools:p.tools})).digest('hex'),prompt_tokens:x.prompt_tokens,generated_tokens:x.generated_tokens,raw_hash:createHash('sha256').update(x.raw).digest('hex'),ttft_s:x.first_token_s,prefill_s:x.prefill_s,source_load_s:x.source_load_s,handoff_ms:x.handoff_ms,shared_bytes:x.shared_bytes,copied_bytes:x.copied_bytes};
});
const comparable_prefix=rows.length===3&&rows.every(x=>x.prompt_hash===rows[0].prompt_hash&&x.prompt_tokens===rows[0].prompt_tokens),copy=rows.find(x=>x.arm==='copy'),share=rows.find(x=>x.arm==='share');
const result={rows,identical_first_prompt:comparable_prefix,transfer_only:copy&&share&&copy.prompt_hash===share.prompt_hash&&copy.copied_bytes===share.shared_bytes?{copied_ms:copy.handoff_ms,shared_ms:share.handoff_ms,saved_ms:copy.handoff_ms-share.handoff_ms}:null,note:'Single observation/arm, fixed cold input only; later prompts/work may diverge. No completed-task speedup inferred.'};
writeFileSync(root+'/cold-diagnostic.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
