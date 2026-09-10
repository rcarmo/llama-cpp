import { test, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { audit } from './audit-results';
function check(change: (files: any, i: number) => void, verify: (root: string) => void) {
    const root = mkdtempSync(join(tmpdir(), 'f32-batch-audit-'));
    try {
        for (const [i, ubatch] of [256, 1024, 1024, 256, 1024, 256, 256, 1024].entries()) {
            const dir = root + `/runs/measure-${i}-${ubatch}`; mkdirSync(dir, { recursive: true });
            const timings = { cache_n: 64658, prompt_n: 1022, prompt_ms: ubatch === 256 ? 28 : 25, predicted_ms: 6, predicted_n: 21 };
            const answer = 'CEDAR-481 MAPLE-726 BIRCH-953';
            const files: any = {
                'result.json': { ok: true, pass: true, order: i, ubatch, fixture_sha256: 'same', timings, answer, resources: { min_available_kib: 10 * 1048576, peak_trial_swap_kib: 0 }, thermal: {}, final_state: { finite: true, swa_max_cells: 768 } },
                'runtime-identity.json': { sha256: '3d679dce59a861095089582b5a870b19d97e44d65ad7e24e2a77b02a697475b8', environment: { GGML_VK_EXPERIMENTAL_ATTN_MODE: 'f32' }, argv: ['--ubatch-size', String(ubatch)] },
                'tail.json': { response: { content: answer, timings }, measurement: { wall_ms: timings.prompt_ms + 6 } },
                'state-inspection.json': { total_nan: 0, total_inf: 0, parsed_bytes: 100, size: 100, caches: 2 },
            };
            change(files, i); for (const [name, value] of Object.entries(files)) writeFileSync(dir + '/' + name, JSON.stringify(value));
        }
        verify(root);
    } finally { rmSync(root, { recursive: true, force: true }); }
}
test('matched interaction reproduces medians and complete status', () => check(() => {}, root => { const r = audit(root); expect(r.complete).toBe(true); expect(r.profiles[256].n).toBe(4); expect(r.prefill_reduction_pct).toBeCloseTo(10.714285, 5); }));
test('wrong mapped library hash is rejected', () => check((f, i) => { if (i === 0) f['runtime-identity.json'].sha256 = 'wrong'; }, root => expect(() => audit(root)).toThrow('Runtime/precision')));
test('different evaluated context invalidates comparison', () => check((f, i) => { if (i === 0) f['result.json'].timings.prompt_n = 1023; }, root => expect(() => audit(root)).toThrow('Exact cache')));
test('changed actual ubatch invalidates profile', () => check((f, i) => { if (i === 0) f['runtime-identity.json'].argv[1] = '1024'; }, root => expect(() => audit(root)).toThrow('Actual microbatch')));
test('final nonfinite KV invalidates combined candidate', () => check((f, i) => { if (i === 7) f['state-inspection.json'].total_nan = 1; }, root => expect(() => audit(root)).toThrow('Final finite')));
test('fixture changes invalidate paired comparison', () => check((f, i) => { if (i === 0) f['result.json'].fixture_sha256 = 'other'; }, root => expect(() => audit(root)).toThrow('Fixture mismatch')));

test('fresh64K checks independentCPU256/GPU1024 arguments and signed regression', () => check(() => {}, root => {
    const dir=root+'/runs/full64-f32-1024';mkdirSync(dir,{recursive:true});
    const result={ok:true,pass:true,append_pass:true,state_finite:true,actual_tokens:64663,cache_n:64662,prompt_n:1,append_cache_n:64684,append_prompt_n:15,swa_max_cells:768,total_ms:110,calls:[{label:'prefill',timings:{prompt_ms:100}}],resources:{min_available_kib:10*1048576,peak_trial_swap_kib:0}};
    writeFileSync(dir+'/result.json',JSON.stringify(result));writeFileSync(dir+'/state-inspection.json',JSON.stringify({total_nan:0,total_inf:0,parsed_bytes:100,size:100}));
    writeFileSync(dir+'/cpu-argv.json',JSON.stringify(['--ubatch-size','256']));writeFileSync(dir+'/vulkan-argv.json',JSON.stringify(['--ubatch-size','1024']));
    writeFileSync(root+'/control-full64-f32-256.json',JSON.stringify({total_ms:100,calls:[{label:'prefill',timings:{prompt_ms:90}}]}));
    const r=audit(root);expect(r.full64.total_reduction_pct).toBeCloseTo(-10,6);
    writeFileSync(dir+'/cpu-argv.json',JSON.stringify(['--ubatch-size','1024']));expect(()=>audit(root)).toThrow('CPU/GPU microbatch isolation');
}));
