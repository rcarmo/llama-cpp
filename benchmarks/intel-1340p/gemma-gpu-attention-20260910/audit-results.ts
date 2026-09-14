/** SCRIPT_JDOC:
{"summary":"Audit retained Iris Xe attention evidence, cache coverage, numerical failures and restoration without inference","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
export function audit(root: string) {
    const read = (p: string) => JSON.parse(readFileSync(root + '/' + p, 'utf8'));
    const run = (n: string) => read('runs/' + n + '/result.json');
    const assert = (v: unknown, s: string) => { if (!v) throw Error(s); };
    const median = (a: number[]) => { const b = [...a].sort((a, b) => a - b); return (b[Math.floor((b.length - 1) / 2)] + b[Math.floor(b.length / 2)]) / 2; };
    const validTail = (r: any, count: number) => r.ok && r.rows.length === count && r.rows.every(x => x.pass && x.timings.prompt_n === 1022 && x.timings.cache_n === 64658);
    const screens = ['base', 'small', 'f32'].map(mode => {
        const r = run('screen64-' + mode);
        assert(validTail(r, 2), 'Screen correctness');
        return { mode, rows: r.rows, pp_median_ms: median(r.rows.map(x => x.timings.prompt_ms)), resources: r.resources };
    });
    const numeric = run('attention-native-controls');
    assert(numeric.ok && numeric.rows.map(r => r.rc).join(',') === '1,1,0', 'Native diagnostic');
    const native = numeric.rows.map(r => {
        const s = readFileSync(root + `/runs/attention-native-controls/${r.mode}.log`, 'utf8').replace(/\x1b\[[0-9;]*m/g, '');
        const count = s.match(/(\d+)\/6 tests passed/);
        assert(count && +count[1] === (r.mode === 'f32' ? 6 : 4), 'Native expected pass counts');
        if (r.mode !== 'base') assert(s.includes('ATTN_OVERRIDE mode=' + r.mode), 'Override trace');
        return { mode: r.mode, passed: +count![1], total: 6, errors: [...s.matchAll(/ERR = ([0-9.]+) > ([0-9.]+)/g)].map(m => ({ error: +m[1], threshold: +m[2] })) };
    });
    const order = ['base', 'f32', 'f32', 'base', 'f32', 'base', 'base', 'f32'], confirms: any[] = [];
    for (let i = 0; i < order.length; i++) {
        const mode = order[i], path = `runs/confirm64-${i}-${mode}/result.json`;
        if (!existsSync(root + '/' + path)) continue;
        const r = read(path);
        assert(r.mode === mode && validTail(r, 1), 'Confirm recall/cache coverage');
        confirms.push({ i, mode, t: r.rows[0].timings, wall_ms: r.calls.find(c => c.label === 'tail-0').wall_ms });
    }
    const confirmed: any = {};
    for (const mode of ['base', 'f32']) {
        const rows = confirms.filter(r => r.mode === mode);
        confirmed[mode] = { n: rows.length, rows, pp_median_ms: rows.length ? median(rows.map(r => r.t.prompt_ms)) : null, wall_median_ms: rows.length ? median(rows.map(r => r.wall_ms)) : null };
    }
    let full: any = null;
    if (existsSync(root + '/runs/full64-f32/result.json')) {
        full = run('full64-f32');
        assert(full.ok && full.pass && full.append_pass && full.state_finite && full.prompt_n === 1 && full.cache_n === 64662 && full.actual_tokens === 64663 && full.append_cache_n >= 64663 && full.append_prompt_n <= 32 && full.swa_max_cells <= 768, 'Full64K finite/recall/cache');
        const scan = read('runs/full64-f32/state-inspection.json');
        assert(scan.total_nan === 0 && scan.total_inf === 0 && scan.size === scan.parsed_bytes && scan.caches === 2, 'Full64K raw finite scan');
    }
    const prior = read('control-full64.json');
    const all = readdirSync(root + '/runs').filter(n => existsSync(root + '/runs/' + n + '/result.json')).map(name => ({ name, ...run(name) }));
    assert(all.every(r => r.ok && r.resources.peak_trial_swap_kib === 0 && r.resources.min_available_kib >= 6 * 1048576), 'Run completion/resource guard');
    let restoration: any = null;
    if (existsSync(root + '/restoration-identity.json')) {
        const identity = read('restoration-identity.json'), smoke = read('restoration-tool-smoke/results.json');
        assert(identity.pass && identity.swap_kib === 0 && identity.libraries.every(r => r.mapped && r.expected_sha256 === r.actual_sha256), 'Restoration identity');
        assert(!smoke.failure && smoke.calls === 4 && smoke.rows.length === 3 && smoke.rows.every(r => r.pass), 'Restoration tool/cache gate');
        restoration = { pass: true, pid: identity.pid, verified_at: identity.verified_at, swap_kib: identity.swap_kib, tool_cases: smoke.rows };
    }
    const complete = confirms.length === 8;
    return {
        audit_pass: true, production_promoted: false, screens, native, confirmed, confirmation_complete: complete,
        tail_prefill_reduction_pct: complete ? 100 * (1 - confirmed.f32.pp_median_ms / confirmed.base.pp_median_ms) : null,
        tail_wall_reduction_pct: complete ? 100 * (1 - confirmed.f32.wall_median_ms / confirmed.base.wall_median_ms) : null,
        full64: full, prior_full64_ms: prior.total_ms,
        full64_reduction_pct: full ? 100 * (1 - full.total_ms / prior.total_ms) : null,
        full64_prefill_reduction_pct: full ? 100 * (1 - full.calls.find(c => c.label === 'prefill').timings.prompt_ms / prior.calls.find(c => c.label === 'prefill').timings.prompt_ms) : null,
        restoration, review: read('review.json'),
        runs: all.map(r => ({ name: r.name, ok: r.ok, error: r.error, resources: r.resources, thermal: r.thermal })),
        limits: ['Exact PCI a7a0 and matching F16/F32 long GEMMs only', 'Baseline native precision failures retained', 'Full64 comparison is one temporal pair; startup, warm append and finite scan excluded from total_ms', 'Existing coding fixture is about3.2K and does not qualify this selector', 'No rollout, broad quality or native crash qualification'],
    };
}
if (import.meta.main) {
    const out = audit(import.meta.dir);
    writeFileSync(import.meta.dir + '/results.json', JSON.stringify(out, null, 2) + '\n');
    console.log(JSON.stringify({ audit_pass: out.audit_pass, confirmation_complete: out.confirmation_complete, tail_prefill_reduction_pct: out.tail_prefill_reduction_pct, full64_reduction_pct: out.full64_reduction_pct, full64_prefill_reduction_pct: out.full64_prefill_reduction_pct, restoration: out.restoration }, null, 2));
}
