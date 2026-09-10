/** SCRIPT_JDOC:
{"summary":"Audit the retained long coding ABBA block: identical cold fixture, executable task checks, CPU cache reuse and timings","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
export function audit(root: string) {
    const read = (p: string) => JSON.parse(readFileSync(root + '/' + p, 'utf8'));
    const assert = (v: unknown, reason: string) => { if (!v) throw Error(reason); };
    const median = (a: number[]) => { const s = [...a].sort((a, b) => a - b); return (s[Math.floor((s.length - 1) / 2)] + s[Math.floor(s.length / 2)]) / 2; };
    const order = ['base', 'f32', 'f32', 'base'];
    const rows: any[] = [];
    for (let i = 0; i < order.length; i++) {
        const profile = order[i], dir = `runs/coding-${i}-${profile}`;
        if (!existsSync(root + '/' + dir + '/result.json')) continue;
        const r = read(dir + '/result.json');
        // Retain task failures as results; resource/cache violations invalidate the comparison.
        assert(r.profile === profile || !r.ok, 'Profile order mismatch');
        const fixture = read(dir + '/cold-fixture.json');
        assert(fixture.n_tokens >= 35000 && fixture.n_tokens <= 40000 && fixture.n_tokens === fixture.tokens.length, 'Prespecified cold token coverage');
        const fixtureHash = createHash('sha256').update(JSON.stringify(fixture)).digest('hex');
        const routes = readdirSync(root + '/' + dir).filter(n => /^route-median-0-round-\d+\.json$/.test(n)).sort().map(n => read(dir + '/' + n));
        assert(routes.length > 0, 'No completed route');
        const cold = routes[0], warm = routes.slice(1);
        assert(cold.routed && cold.prefill.tokens === fixture.n_tokens && cold.cache >= fixture.n_tokens - 2 && cold.evaluated <= 2, 'Native cold handoff coverage');
        assert(warm.every(r => !r.routed && r.cache > fixture.n_tokens - 2), 'Warm CPU ownership/reuse');
        const growingCache = warm.map((route, i) => {
            const previous = routes[i];
            const expected = previous.usage.prompt_tokens + previous.usage.completion_tokens;
            assert(route.cache >= expected - 2, 'Growing-prefix cache coverage');
            assert(route.cache + route.evaluated === route.usage.prompt_tokens, 'Prompt/cache accounting');
            return { round: i + 1, previous_prompt_and_output: expected, cached: route.cache, evaluated: route.evaluated };
        });
        const pp = r.calls.find(c => c.label === 'median-0-round-0-gpu');
        assert(pp && pp.timings.cache_n === 0 && pp.timings.prompt_n === fixture.n_tokens - 1, 'Cold GPU coverage');
        assert(r.resources.peak_trial_swap_kib === 0 && r.resources.min_available_kib >= 6 * 1048576, 'Resource envelope');
        const tests = r.runs?.[0];
        const logPath = root + '/' + dir + '/vulkan.log';
        const progress = existsSync(logPath) ? readFileSync(logPath, 'utf8').match(/n_tokens =\s+32768,.*?t =\s+([0-9.]+) s/) : null;
        const first32Kms = progress ? Number(progress[1]) * 1000 : null;
        rows.push({
            order: i, profile, ok: r.ok, error: r.error, task_pass: !!tests?.pass,
            fixture_tokens: fixture.n_tokens, fixture_sha256: fixtureHash,
            prefill_ms: pp.timings.prompt_ms, cold_route_ms: cold.wall_ms,
            first_32768_ms_from_progress: first32Kms,
            remaining_prefill_ms_from_progress: first32Kms === null ? null : pp.timings.prompt_ms - first32Kms,
            warm_route_ms: warm.reduce((n, r) => n + r.wall_ms, 0),
            route_total_ms: routes.reduce((n, r) => n + r.wall_ms, 0),
            rounds: routes.length, output_tokens: routes.reduce((n, r) => n + (r.usage?.completion_tokens ?? 0), 0),
            tools: tests?.rounds.map(r => r.tools ?? []), independent: tests?.independent,
            resources: r.resources, thermal: r.thermal, growing_cache: growingCache, routes,
        });
    }
    assert(new Set(rows.map(r => r.fixture_sha256)).size <= 1, 'Cold fixture changed between modes');
    const complete = rows.length === 4;
    const modes: any = {};
    for (const profile of ['base', 'f32']) {
        const selected = rows.filter(r => r.profile === profile);
        modes[profile] = { n: selected.length, passes: selected.filter(r => r.task_pass).length };
        for (const field of ['prefill_ms', 'cold_route_ms', 'warm_route_ms', 'route_total_ms', 'output_tokens', 'rounds']) modes[profile][field] = selected.length ? median(selected.map(r => r[field])) : null;
    }
    const reduction: any = {};
    if (complete) for (const field of ['prefill_ms', 'cold_route_ms', 'warm_route_ms', 'route_total_ms']) reduction[field] = 100 * (1 - modes.f32[field] / modes.base[field]);
    return { audit_pass: true, complete, all_tasks_pass: complete && rows.every(r => r.ok && r.task_pass), rows, modes, reduction_pct: reduction,
        limits: ['One synthetic coding task and one ABBA block, two/profile; no broad quality equivalence', 'Only normal versus FP32 selector changed; whole GPU prefill mostly below the32768 gate', 'Route total is sum of request-route wall times, excluding external tool execution and initial CPU startup', 'Output/tool-path variation is retained; compare token counts as well as wall time', 'Production remains original CPU; no deployment'] };
}
if (import.meta.main) {
    const r = audit(import.meta.dir);
    writeFileSync(import.meta.dir + '/results.json', JSON.stringify(r, null, 2) + '\n');
    console.log(JSON.stringify({ complete: r.complete, all_tasks_pass: r.all_tasks_pass, modes: r.modes, reduction_pct: r.reduction_pct }, null, 2));
}
