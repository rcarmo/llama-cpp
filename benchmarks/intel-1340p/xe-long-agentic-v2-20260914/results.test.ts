import{test,expect}from'bun:test';import{readFileSync}from'node:fs';import{verifyRun}from'./verify-run';
const root=import.meta.dir,s=JSON.parse(readFileSync(root+'/summary.json','utf8')),c=JSON.parse(readFileSync(root+'/cold-diagnostic.json','utf8'));
test('three first-pass attempts retained,failed task never converted to speedup',()=>{
 expect(s.complete).toBe(true);expect(s.balanced_matrix_complete).toBe(false);expect(s.rows.map(r=>r.arm)).toEqual(['cpu','copy','share']);
 expect(s.rows.map(r=>r.completed_phases)).toEqual([2,0,0]);expect(s.rows.every(r=>!r.success)).toBe(true);
 for(const p of s.comparisons){expect(p.comparable).toBe(false);expect(p.changes).toBeNull();}
});
test('all routing,ownership,grades andweightedemission rates verify fromrawruns',()=>{
 for(const row of s.rows){const r=verifyRun(row.id);expect(r.decode_tps).toBeCloseTo(row.decode_interval_tokens/row.decode_interval_s,10);expect(r.generated).toBe(row.generated);expect(r.failure).toBe(row.failure);}
});
test('copy/shareidenticalfailedwork,coldpromptmatchesallthree,transferonlysavedmsrecomputed',()=>{
 const copy=s.rows[1],share=s.rows[2];expect(copy.raw_hash).toBe(share.raw_hash);expect(copy.source_hash).toBe(share.source_hash);expect(copy.prompts).toEqual(share.prompts);
 for(const k of ['generated','evaluated','drafted','accepted','rounds'])expect(copy[k]).toBe(share[k]);
 expect(c.identical_first_prompt).toBe(true);expect(c.rows.every(x=>x.prompt_tokens===2212)).toBe(true);
 expect(copy.copied_bytes).toBe(share.shared_bytes);expect(copy.shared_bytes).toBe(0);expect(share.copied_bytes).toBe(0);
 expect(c.transfer_only.saved_ms).toBeCloseTo(copy.handoff_ms-share.handoff_ms,10);
});
