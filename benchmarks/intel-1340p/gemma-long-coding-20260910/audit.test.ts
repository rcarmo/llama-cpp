import { test, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { audit } from './audit-results';
function fixture(change: (data: any, i: number) => void = () => {}) {
    const root = mkdtempSync(join(tmpdir(), 'long-coding-audit-'));
    for (const [i, profile] of ['base', 'f32', 'f32', 'base'].entries()) {
        const dir = root + `/runs/coding-${i}-${profile}`;
        mkdirSync(dir, { recursive: true });
        const cold = { routed: true, prefill: { tokens: 36000 }, cache: 35999, evaluated: 1, wall_ms: profile === 'base' ? 100 : 90, usage: { prompt_tokens: 36000, completion_tokens: 20 } };
        const warm = { routed: false, cache: 36020, evaluated: 30, wall_ms: 20, usage: { prompt_tokens: 36050, completion_tokens: 40 } };
        const data: any = {
            'result.json': { ok: true, profile, resources: { peak_trial_swap_kib: 0, min_available_kib: 10 * 1048576 }, thermal: {}, calls: [{ label: 'median-0-round-0-gpu', timings: { cache_n: 0, prompt_n: 35999, prompt_ms: profile === 'base' ? 90 : 80 } }], runs: [{ pass: true, rounds: [{ tools: ['read_file'] }, { tools: ['edit_file', 'run_tests'] }], independent: { rc: 0 } }] },
            'cold-fixture.json': { n_tokens: 36000, tokens: Array(36000).fill(7) },
            'route-median-0-round-0.json': cold,
            'route-median-0-round-1.json': warm,
        };
        change(data, i);
        for (const [name, value] of Object.entries(data)) writeFileSync(dir + '/' + name, JSON.stringify(value));
    }
    return root;
}
function check(change: (data: any, i: number) => void, fn: (root: string) => void) {
    const root = fixture(change); try { fn(root); } finally { rmSync(root, { recursive: true, force: true }); }
}
test('ABBA audit separates GPU, route and warm timing', () => check(() => {}, root => {
    const r = audit(root);
    expect(r.complete).toBe(true); expect(r.all_tasks_pass).toBe(true);
    expect(r.modes.base.n).toBe(2); expect(r.modes.f32.n).toBe(2);
    expect(r.reduction_pct.warm_route_ms).toBe(0);
    expect(r.reduction_pct.route_total_ms).toBeCloseTo(8.33333, 4);
}));
test('task failure retained without turning it into performance acceptance', () => check((data, i) => { if (i === 1) { data['result.json'].ok = false; data['result.json'].runs[0].pass = false; } }, root => {
    const r = audit(root); expect(r.complete).toBe(true); expect(r.all_tasks_pass).toBe(false); expect(r.modes.f32.passes).toBe(1);
}));
test('changed cold fixture invalidates matched comparison', () => check((data, i) => { if (i === 1) data['cold-fixture.json'].tokens[0] = 8; }, root => expect(() => audit(root)).toThrow('Cold fixture changed')));
test('warm GPU reroute invalidates CPU-owner comparison', () => check((data, i) => { if (i === 1) data['route-median-0-round-1.json'].routed = true; }, root => expect(() => audit(root)).toThrow('Warm CPU ownership')));
test('warm cache must retain the growing transcript', () => check((data, i) => { if (i === 1) data['route-median-0-round-1.json'].cache = 36000; }, root => expect(() => audit(root)).toThrow('Growing-prefix cache')));
test('trial swapping invalidates comparison', () => check((data, i) => { if (i === 1) data['result.json'].resources.peak_trial_swap_kib = 1; }, root => expect(() => audit(root)).toThrow('Resource envelope')));
