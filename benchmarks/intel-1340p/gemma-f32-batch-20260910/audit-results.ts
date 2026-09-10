/** SCRIPT_JDOC:
{"summary":"Audit the FP32256/1024 interaction with preserved preflight failure, exact cache and runtime checks","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
export function audit(root: string) {
    const read = (p: string) => JSON.parse(readFileSync(root + '/' + p, 'utf8'));
    const assert = (v: unknown, message: string) => { if (!v) throw Error(message); };
    const median = (a: number[]) => { const s = [...a].sort((a, b) => a - b); return (s[Math.floor((s.length - 1) / 2)] + s[Math.floor(s.length / 2)]) / 2; };
    const order = [256, 1024, 1024, 256, 1024, 256, 256, 1024], rows: any[] = [];
    for (const [i, ubatch] of order.entries()) {
        const dir = `runs/measure-${i}-${ubatch}`;
        if (!existsSync(root + '/' + dir + '/result.json')) continue;
        const r = read(dir + '/result.json'), id = read(dir + '/runtime-identity.json');
        assert(r.ok && r.pass && r.order === i && r.ubatch === ubatch, 'Run completion/profile');
        assert(r.timings.cache_n === 64658 && r.timings.prompt_n === 1022, 'Exact cache coverage');
        assert(id.sha256 === '3d679dce59a861095089582b5a870b19d97e44d65ad7e24e2a77b02a697475b8' && id.environment.GGML_VK_EXPERIMENTAL_ATTN_MODE === 'f32', 'Runtime/precision identity');
        assert(!id.environment.GGML_VK_EXPERIMENTAL_ATTN_TRACE && !id.environment.GGML_VK_PERF_LOGGER, 'Intrusive profiling');
        assert(id.argv[id.argv.indexOf('--ubatch-size') + 1] === String(ubatch), 'Actual microbatch');
        assert(r.resources.min_available_kib >= 6 * 1048576 && r.resources.peak_trial_swap_kib === 0, 'Resource envelope');
        const tail = read(dir + '/tail.json');
        assert(tail.response.content === r.answer && tail.response.timings.prompt_ms === r.timings.prompt_ms && ['CEDAR-481', 'MAPLE-726', 'BIRCH-953'].every(k => r.answer.includes(k)), 'Raw result/recall');
        rows.push({ order: i, ubatch, fixture_sha256: r.fixture_sha256, prompt_ms: r.timings.prompt_ms, predicted_ms: r.timings.predicted_ms, predicted_n: r.timings.predicted_n, request_ms: tail.measurement.wall_ms, resources: r.resources, thermal: r.thermal });
        if (i === 7) {
            const state = read(dir + '/state-inspection.json');
            assert(r.final_state?.finite && r.final_state.swa_max_cells <= 768 && state.total_nan === 0 && state.total_inf === 0 && state.parsed_bytes === state.size && state.caches === 2, 'Final finite state');
        }
    }
    assert(new Set(rows.map(r => r.fixture_sha256)).size <= 1, 'Fixture mismatch');
    const profiles: any = {};
    for (const ubatch of [256, 1024]) {
        const group = rows.filter(r => r.ubatch === ubatch);
        profiles[ubatch] = { n: group.length, prefill_ms: group.length ? median(group.map(r => r.prompt_ms)) : null, request_ms: group.length ? median(group.map(r => r.request_ms)) : null };
    }
    const preflight = existsSync(root + '/runs/batch-0-256/result.json') ? read('runs/batch-0-256/result.json') : null;
    if (preflight) assert(!preflight.ok && preflight.calls.length === 0, 'Preflight failure scope');
    const complete = rows.length === 8;
    let full64: any = null;
    if (existsSync(root + '/runs/full64-f32-1024/result.json')) {
        const dir = 'runs/full64-f32-1024', result = read(dir + '/result.json'), scan = read(dir + '/state-inspection.json');
        assert(result.ok && result.pass && result.append_pass && result.state_finite && result.actual_tokens === 64663 && result.cache_n === 64662 && result.prompt_n === 1 && result.append_cache_n >= 64663 && result.append_prompt_n <= 32, 'Full64K native handoff/recall');
        assert(scan.total_nan === 0 && scan.total_inf === 0 && scan.parsed_bytes === scan.size && result.swa_max_cells <= 768, 'Full64K state integrity');
        for (const [device, expected] of [['cpu', '256'], ['vulkan', '1024']]) {
            const argv = read(dir + '/' + device + '-argv.json');
            assert(argv[argv.indexOf('--ubatch-size') + 1] === expected, 'CPU/GPU microbatch isolation');
        }
        assert(result.resources.min_available_kib >= 6 * 1048576 && result.resources.peak_trial_swap_kib === 0, 'Full64K resource envelope');
        const control = read('control-full64-f32-256.json');
        const pp = (r: any) => r.calls.find(c => c.label === 'prefill').timings.prompt_ms;
        full64 = { result, control_total_ms: control.total_ms, control_prefill_ms: pp(control), total_reduction_pct: 100 * (1 - result.total_ms / control.total_ms), prefill_reduction_pct: 100 * (1 - pp(result) / pp(control)), scope: 'Single temporal comparison FP32+1024 versus earlierFP32+256; startup/append/scanexcluded' };
    }
    return { audit_pass: true, complete, rows, profiles, full64, prefill_reduction_pct: complete ? 100 * (1 - profiles[1024].prefill_ms / profiles[256].prefill_ms) : null, request_reduction_pct: complete ? 100 * (1 - profiles[1024].request_ms / profiles[256].request_ms) : null, preflight_failure: preflight ? { error: preflight.error, calls: 0 } : null,
        limits: ['FP32 enabled in both profiles; one saved-state tail and four runs/profile', 'Saved-tail gain does not imply full-prefill or CPU-handoff gain', 'Final1024state finite/exportcap check outside timings', 'Prior preflight failed before inference and is preserved separately', 'No deployment or global-maximum claim'] };
}
if (import.meta.main) {
    const r = audit(import.meta.dir);
    writeFileSync(import.meta.dir + '/results.json', JSON.stringify(r, null, 2) + '\n');
    console.log(JSON.stringify({ complete: r.complete, profiles: r.profiles, prefill_reduction_pct: r.prefill_reduction_pct, request_reduction_pct: r.request_reduction_pct, full64: r.full64 ? { total_reduction_pct: r.full64.total_reduction_pct, prefill_reduction_pct: r.full64.prefill_reduction_pct } : null }, null, 2));
}
