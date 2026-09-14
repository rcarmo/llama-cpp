import{test,expect}from'bun:test';import{audit}from'./audit-results';
test('retainedprofileandscreenreproduceindependentcosts',()=>{const r=audit(import.meta.dir);expect(r.rows.length).toBe(8);expect(r.profile[0].phases.target_decode.us).toBe(16455073);expect(r.profile[0].phases.draft.us).toBe(1719653);expect(r.decode_gain_pct).toBeCloseTo(20.79895955,6)});
