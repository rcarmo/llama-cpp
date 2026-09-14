import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
const root=import.meta.dir,r=JSON.parse(readFileSync(root+'/task-summary.json','utf8'));
test('all four predeclared extension runs retained in order',()=>{
 expect(r.complete).toBe(true);expect(r.rows.map(x=>x.id)).toEqual(['master-median-on0','master-median-off0','master-defaults-off0','master-defaults-on0']);
 for(const x of r.rows){expect(x.rounds).toBeLessThanOrEqual(10);expect(x.work.generated_tokens).toBeLessThanOrEqual(5120);expect(x.phases).toBeLessThanOrEqual(2);}
 expect(r.workflow_passes).toBe(r.rows.filter(x=>x.success).length);expect(r.artifact_passes).toBe(r.rows.filter(x=>x.final_artifact_ok).length);
});
test('paired timing is gated by exact work and both task completions',()=>{
 for(const p of r.pairs){
  expect(p.complete).toBe(true);const on=r.rows.find(x=>x.kind===p.kind&&x.arm==='q6on'),off=r.rows.find(x=>x.kind===p.kind&&x.arm==='q6off');
  const same=JSON.stringify(on.prompts)===JSON.stringify(off.prompts)&&on.raw_hash===off.raw_hash&&JSON.stringify(on.work)===JSON.stringify(off.work);
  expect(p.same_work).toBe(same);expect(p.comparable).toBe(same&&on.success&&off.success);
  if(p.comparable){expect(p.whole_change_percent).toBeCloseTo(100*(on.whole_ms/off.whole_ms-1),10);expect(p.warm_change_percent).toBeCloseTo(100*(on.warm_s/off.warm_s-1),10);}else{expect(p.whole_change_percent).toBeNull();expect(p.warm_change_percent).toBeNull();}
 }
});
test('clamp pilot is qualified separately and old runtime work mismatch stays visible',()=>{
 const p=JSON.parse(readFileSync(root+'/agentic-runs/master-clamp-on-pilot/result.json','utf8'));
 expect(p.success).toBe(true);expect(p.phases).toBe(2);expect(p.rounds.length).toBe(9);
 expect(['generated_tokens','evaluated_prompt_tokens','drafted','accepted'].map(k=>p.rounds.reduce((s,x)=>s+x[k],0))).toEqual([559,791,522,385]);
 expect(r.rows.some(x=>x.id==='master-clamp-on-pilot')).toBe(false);
});
