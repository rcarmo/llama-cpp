import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
const root=import.meta.dir,d=JSON.parse(readFileSync(root+'/data.json','utf8'));
const median=(a:number[])=>{a=[...a].sort((x,y)=>x-y);return(a[(a.length-1)>>1]+a[a.length>>1])/2;};
test('all sixteen valid unprofiled runs, not aborted/profiled observations',()=>{
 expect(d.observations.length).toBe(16);
 expect(d.observations.map(x=>x.id)).toEqual(['r0','r1','r2','r3','r4','r5','r6','r7','s0','s1','s2','s3','l0','l1','l2','l3']);
 expect(d.summaries.map(x=>x.n_per_arm)).toEqual([4,2,2]);
 expect(d.summaries.map(x=>[x.prompt,x.output])).toEqual([[309,128],[1021,512],[4003,512]]);
});
test('tok/s and transfer deltas recompute from all retained observations',()=>{
 for(const s of d.summaries){
  const rows=d.observations.filter(x=>x.prompt_tokens===s.prompt);
  for(const arm of ['share','copy']){
   const a=rows.filter(x=>x.arm===arm),t=a.map(x=>x.decode_tps),h=a.map(x=>x.handoff_ms);
   expect(s[arm].decode_tps.median).toBe(median(t));expect(s[arm].decode_tps.min).toBe(Math.min(...t));expect(s[arm].decode_tps.max).toBe(Math.max(...t));
   expect(s[arm].handoff_ms.median).toBe(median(h));
  }
  expect(s.decode_change_percent).toBeCloseTo(100*(s.share.decode_tps.median/s.copy.decode_tps.median-1),10);
  expect(s.decode_delta_tps).toBeCloseTo(s.share.decode_tps.median-s.copy.decode_tps.median,10);
  expect(s.handoff_saved_ms).toBeCloseTo(s.copy.handoff_ms.median-s.share.handoff_ms.median,10);
  expect(new Set(rows.map(x=>x.output_hash)).size).toBe(1);
 }
});
test('gain, regression and neutral result are all visible without replacing units',()=>{
 expect(d.summaries[0].decode_change_percent).toBeGreaterThan(9);
 expect(d.summaries[1].decode_change_percent).toBeLessThan(-3);
 expect(Math.abs(d.summaries[2].decode_change_percent)).toBeLessThan(0.2);
 const svg=readFileSync(root+'/zero-copy-throughput.svg','utf8');
 for(const s of d.summaries)for(const arm of ['copy','share'])expect(svg).toContain(s[arm].decode_tps.median.toFixed(2));
 expect(svg).toContain('-0.03 tok/s');expect(svg).toContain('-0.71 tok/s');
 expect(svg).toContain('not coding-agent tok/s');expect(svg).toContain('startup/prefill excluded');
});
