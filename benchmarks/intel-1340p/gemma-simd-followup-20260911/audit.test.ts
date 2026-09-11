import{test,expect}from'bun:test';import{readFileSync}from'node:fs';import{audit}from'./audit';const root=import.meta.dir;
const mutate=(p:string,fn:(x:any)=>void)=>{const x=JSON.parse(readFileSync(root+'/'+p,'utf8'));fn(x);return{[p]:JSON.stringify(x)}};
test('both effective SIMD candidates lost matched ABBA screens',()=>{const r=audit(root);expect(r.audit_pass).toBe(true);expect(r.production_changed).toBe(false);expect(r.results).toHaveLength(2);expect(r.results[0].decode_pct).toBeCloseTo(-1.651720446,7);expect(r.results[1].decode_pct).toBeCloseTo(-4.147624605,7);expect(r.results.every(r=>r.rows.length===4)).toBe(true);expect(r.results.every(r=>r.request_pct>0)).toBe(true)});
test('reject changed work',()=>expect(()=>audit(root,mutate('runs/packed-q4-0-mode0/decode.json',x=>x.response.timings.cache_n=0))).toThrow('Exactnativecounts'));
test('reject missing actual library',()=>expect(()=>audit(root,mutate('runs/score-0-mode0/runtime-provenance.json',x=>x.files[0].sha256='0'.repeat(64)))).toThrow('Mappedidentity'));
test('reject trace-enabled timing',()=>expect(()=>audit(root,mutate('runs/score-0-mode0/runtime-provenance.json',x=>x.flags.push('GGML_CPU_SCORE3_NOUNROLL_TRACE=1')))).toThrow('No timingtrace'));
test('reject retroactive tinyBLAS success',()=>expect(()=>audit(root,mutate('runs/probe-0-mode1/result.json',x=>x.ok=true))).toThrow('ActualtinyBLASexclusion'));
test('reject stale restoration',()=>expect(()=>audit(root,mutate('restoration-check.json',x=>x.verified_at='2026-09-11T01:00:00Z'))).toThrow('Restorationafteralltimings'));
