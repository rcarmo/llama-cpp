/** SCRIPT_JDOC:
{"summary":"Reconstruct smallbatchdecode confirmation, prefills, finite lifecycle and deployed identity from retained records","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import { readFileSync, writeFileSync } from 'node:fs';
export function audit(root: string) {
    const read = (p: string) => JSON.parse(readFileSync(root + '/' + p, 'utf8'));
    const assert = (v: unknown, message: string) => { if (!v) throw Error(message); };
    const median = (a: number[]) => { const b = [...a].sort((a, b) => a - b); return (b[Math.floor((b.length - 1) / 2)] + b[Math.floor(b.length / 2)]) / 2; };
    const modes = [0, 1, 1, 0, 1, 0, 0, 1];
    const rows = modes.map((mode, i) => {
        const dir = `runs/confirm-${i}-mode${mode}`;
        const r = read(dir + '/result.json'), raw = read(dir + '/decode.json'), argv = read(dir + '/cpu-argv.json');
        assert(r.ok && r.pass && r.order === i && r.threads === mode, 'Confirmation profile/pass');
        assert(r.timings.cache_n === 64658 && r.timings.prompt_n === 25 && r.timings.predicted_n === 128, 'Exact confirmation coverage');
        assert(r.timings.draft_n === 110 && r.timings.draft_n_accepted === 90, 'Draft coverage');
        assert(raw.response.content === r.answer && ['CEDAR-481', 'MAPLE-726', 'BIRCH-953'].every(k => r.answer.includes(k)), 'Raw recall');
        assert(raw.response.timings.predicted_per_second === r.timings.predicted_per_second, 'Raw timing');
        const active = r.config.extraEnv?.LLAMA_EXPERIMENTAL_SMALL_TARGET_BATCH === '1';
        assert(active === Boolean(mode), 'Mode environment');
        for (const [key, value] of [['--threads', '8'], ['--threads-batch', '16'], ['--spec-draft-threads', '8'], ['--spec-draft-threads-batch', '16']]) assert(argv[argv.indexOf(key) + 1] === value, 'Thread factor isolation');
        assert(r.resources.peak_trial_swap_kib === 0 && r.resources.min_available_kib >= 6 * 1048576, 'Confirmation resources');
        return { order: i, mode, decode_tps: r.timings.predicted_per_second, decode_ms: r.timings.predicted_ms, prompt_ms: r.timings.prompt_ms, request_ms: raw.measurement.wall_ms, token_hash: raw.measurement.token_hash, resources: r.resources, thermal: r.thermal };
    });
    const profiles: any = {};
    for (const mode of [0, 1]) {
        const group = rows.filter(r => r.mode === mode);
        profiles[mode] = { n: group.length, decode_tps: median(group.map(r => r.decode_tps)), decode_ms: median(group.map(r => r.decode_ms)), request_ms: median(group.map(r => r.request_ms)) };
    }
    const prefill = [0, 1].map(mode => {
        const dir = `runs/prefill4k-mode${mode}`, r = read(dir + '/result.json'), raw = read(dir + '/prefill.json');
        assert(r.ok && r.timings.prompt_n === 4096 && r.timings.predicted_n === 1 && raw.response.timings.prompt_ms === r.timings.prompt_ms, 'Prefill coverage');
        assert(r.resources.peak_trial_swap_kib === 0, 'Prefill swap');
        return { mode, prompt_ms: r.timings.prompt_ms, token_hash: raw.measurement.token_hash, scope: 'One temporal pair only; all256rowpromptbatches unchanged by threshold4' };
    });
    const life = read('runs/candidate64-lifecycle/result.json'), scan = read('runs/candidate64-lifecycle/state-inspection.json');
    assert(life.ok && life.finite_state && scan.total_nan === 0 && scan.total_inf === 0 && scan.size === scan.parsed_bytes && scan.caches === 2, 'Finite lifecycle state');
    assert(life.tool_answer.trim() === '23' && life.append_cache === 64684 && life.append_evaluated === 15, 'Tool/longcache lifecycle');
    const recall = read('runs/candidate64-lifecycle/recall.json').response;
    assert(recall.timings.cache_n === 64662 && recall.timings.prompt_n === 1, 'Long state reuse');
    const production = read('production-smoke.json');
    assert(production.pass && production.cpu_swap_kib === 0 && production.status.counters.gpu === 1 && production.status.counters.warm === 3 && production.status.counters.errors === 0 && production.status.counters.fallback === 0, 'Production smoke');
    const deployed = read('deployed-runtime.json');
    assert(deployed.pass && deployed.environment.LLAMA_EXPERIMENTAL_SMALL_TARGET_BATCH === '1' && deployed.library.sha256 === '35289adccdf6965d3d7eb7ade2271723b1169e65772bf849c8a5431288d0aec9', 'Deployed candidate identity');
    return { audit_pass: true, confirmation_complete: true, rows, profiles,
        decode_gain_pct: 100 * (profiles[1].decode_tps / profiles[0].decode_tps - 1),
        request_reduction_pct: 100 * (1 - profiles[1].request_ms / profiles[0].request_ms),
        observed_same_token_hash: new Set(rows.map(r => r.token_hash)).size === 1,
        prefill, prefill_temporal_reduction_pct: 100 * (1 - prefill[1].prompt_ms / prefill[0].prompt_ms),
        lifecycle: { pass: true, finite: true, recall_cache: 64662, recall_evaluated: 1, tool_answer: life.tool_answer, append_cache: life.append_cache, append_evaluated: life.append_evaluated },
        production: { pass: true, verified_at: production.verified_at, info: production.info, release: deployed.release },
        review: read('review.json'),
        limits: ['One128token counting/recall task at64K, four runs per mode; no broad coding-quality or global-optimum claim', 'Same candidate runtime with flagoff/on controls; retainedCPUABI and onlycontextobject rebuilt', 'Threshold affects all CPU Gemma4 target batches<=4, including tiny prompts; assistant andlargeprefill excluded', '20.80% earlier fixedtargetbatchscreen is distinct from16.52% actualsmallbatchpatchconfirmation'] };
}
if (import.meta.main) {
    const r = audit(import.meta.dir);
    writeFileSync(import.meta.dir + '/results.json', JSON.stringify(r, null, 2) + '\n');
    console.log(JSON.stringify({ audit_pass: r.audit_pass, decode_gain_pct: r.decode_gain_pct, request_reduction_pct: r.request_reduction_pct, prefill_temporal_reduction_pct: r.prefill_temporal_reduction_pct, production: r.production }, null, 2));
}
