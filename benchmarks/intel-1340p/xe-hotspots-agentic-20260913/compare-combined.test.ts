import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
const r=JSON.parse(readFileSync(import.meta.dir+'/combined-summary.json','utf8'));
const median=(a:number[])=>{a=[...a].sort((x,y)=>x-y);return(a[(a.length-1)>>1]+a[a.length>>1])/2;};
test('final matrix is ordered, complete, independently passed and equal work',()=>{
    expect(r.complete).toBe(true);expect(r.same_work).toBe(true);expect(r.qualified).toBe(true);
    expect(r.rows.map(x=>x.arm)).toEqual(['baseline','combined','combined','baseline']);
    for(const x of r.rows){expect(x.success).toBe(true);expect(x.phases).toBe(2);expect([x.generated,x.evaluated,x.drafted,x.accepted]).toEqual([572,900,549,389]);expect(x.source_hash).toBe(r.rows[0].source_hash);}
});
test('every stage percentage recomputes from both arm observations',()=>{
    for(const key of ['wall_ms','warm_native_s','warm_ttft_s','handoff_ms','cold_ttft_s']){
        const b=median(r.rows.filter(x=>x.arm==='baseline').map(x=>x[key])),c=median(r.rows.filter(x=>x.arm==='combined').map(x=>x[key]));
        expect(r.comparisons[key].baseline_median).toBe(b);expect(r.comparisons[key].combined_median).toBe(c);expect(r.comparisons[key].change_percent).toBeCloseTo(100*(c/b-1),10);
    }
});
