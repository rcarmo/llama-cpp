import { test, expect } from 'bun:test';
import { audit } from './audit-results';
import { readFileSync } from 'node:fs';
const read=(p:string)=>JSON.parse(readFileSync(import.meta.dir+'/'+p,'utf8'));
test('eight saved runs isolate the four-query tile and preserve measured work',()=>{
 const r=audit(import.meta.dir);
 expect(r.audit_pass).toBe(true);
 expect(r.rows.map(x=>x.mode)).toEqual([0,1,1,0,1,0,0,1]);
 expect(r.decode_gain_pct).toBeCloseTo(2.903504689,7);
 expect(r.request_reduction_pct).toBeCloseTo(2.467564861,7);
 expect(r.all_candidates_faster).toBe(false);
 expect(r.diagnostics).toEqual({identical_output_hashes:true,matched_draft_counts:true});
 expect(r.native.shapes.length).toBe(4);
 expect(r.prefill_change_pct).toBeCloseTo(0.356635081,7);
 expect(r.qualification).toEqual({finite_state:true,tools:true,append_cache:64684,append_evaluated:15});
});
test('promotion has live identity, tool/cache and continuous resource evidence; first failure retained',()=>{
 const r=read('production-smoke.json'),samples=read('cutover-guard-samples.json');
 expect(r.pass).toBe(true);
 expect(r.continuous_guard).toBe(true);
 expect(r.rows.map(x=>x.label)).toEqual(['cold-sse','tool-none','tool-auto','append']);
 expect(r.experimental_flags).toContain('GGML_CPU_EXPERIMENTAL_ATTN4=1');
 expect(r.experimental_flags).toContain('LLAMA_EXPERIMENTAL_SMALL_TARGET_BATCH=1');
 expect(r.cpu_swap_kib).toBe(0);
 expect(samples.length).toBe(92);
 expect(samples.every(x=>x.available_kib>=6*1048576 && x.workers.every(w=>w.swap_kib===0))).toBe(true);
 expect(samples.some(x=>x.workers.some(w=>w.port==='18093'))).toBe(true);
 expect(read('failed-cutover-1/production-smoke.json').pass).toBe(false);
});
