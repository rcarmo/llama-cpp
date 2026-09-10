/** SCRIPT_JDOC:
{"summary":"Measure FP32 attention and microbatch interaction on the same saved64K tail; validate final state outside timings","kind":"mixed","weight":"heavy","role":"entrypoint"}
*/
import { Trial, root, save } from './campaign';
import { copyFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const order = Number(process.argv[2]);
const batches = [256, 1024, 1024, 256, 1024, 256, 256, 1024];
if (!Number.isInteger(order) || order < 0 || order >= batches.length) throw Error('ABBA/BAAB order');
const ubatch = batches[order];
const runtime = '/var/home/agent/workspace/reports/gemma-gpu-attention-20260910/runtime-gpu';
const t = new Trial(`measure-${order}-${ubatch}`, { maintenance: true, format: 'f16', fa: false, full: false, ctx: 147456, parallel: 2, cache: 0, ubatch, batch: 1024, vulkanBuild: runtime, preserveSwaPadding: true, extraEnv: { GGML_VK_EXPERIMENTAL_ATTN_MODE: 'f32' } });
let result: any = {};
try {
    await t.begin();
    const worker = await t.start('vulkan');
    const maps = readFileSync(`/proc/${worker.p.pid}/maps`, 'utf8');
    const library = [...new Set(maps.split('\n').map(line => line.trim().split(/\s+/).slice(5).join(' ')))].find(path => path.startsWith(runtime + '/bin/libggml-vulkan.so.'));
    if (!library) throw Error('Retained selector library not mapped');
    const digest = createHash('sha256').update(readFileSync(library)).digest('hex');
    if (digest !== '3d679dce59a861095089582b5a870b19d97e44d65ad7e24e2a77b02a697475b8') throw Error('Retained selector runtime identity');
    const env = Object.fromEntries(readFileSync(`/proc/${worker.p.pid}/environ`, 'utf8').split('\0').filter(e => /^(GGML_VK_|LLAMA_EXPERIMENTAL_)/.test(e)).map(e => { const i = e.indexOf('='); return [e.slice(0, i), e.slice(i + 1)]; }));
    if (env.GGML_VK_EXPERIMENTAL_ATTN_MODE !== 'f32' || env.GGML_VK_EXPERIMENTAL_ATTN_TRACE || env.GGML_VK_PERF_LOGGER || env.GGML_VK_EXPERIMENTAL_SPLIT_K) throw Error('Mode or intrusive environment');
    save(t.dir + '/runtime-identity.json', { pid: worker.p.pid, library, sha256: digest, environment: env, argv: worker.argv });
    copyFileSync('/var/home/agent/workspace/reports/gemma-context-coding-20260910/runs/compact64-aligned/slots/long64.slot', t.dir + '/slots/state.slot');
    const fixture = await Bun.file('/var/home/agent/workspace/reports/gemma-hybrid-perf-20260910/runs/vulkan64-tail-profile/fixture.json').json();
    const fixtureHash = createHash('sha256').update(JSON.stringify(fixture)).digest('hex');
    await t.req('vulkan', 'restore', { filename: 'state.slot' }, '/slots/0?action=restore');
    const r = await t.req('vulkan', 'tail', { prompt: fixture.prompt, n_predict: 32, temperature: 0, top_k: 1, cache_prompt: true, id_slot: 0 });
    result = { ok: true, order, ubatch, fixture_sha256: fixtureHash, answer: r.content, pass: ['CEDAR-481', 'MAPLE-726', 'BIRCH-953'].every(x => r.content.includes(x)), timings: r.timings };
    if (!result.pass || r.timings.cache_n !== 64658 || r.timings.prompt_n !== 1022) throw Error('Exact recall/cache coverage');
    if (order === 7) {
        // Extra state I/O/scan is after the final measured request.
        await t.req('vulkan', 'final-save', { filename: 'final.slot' }, '/slots/0?action=save');
        const p = Bun.spawn([process.execPath, root + '/inspect-slot.ts', t.dir + '/slots/final.slot', t.dir + '/state-inspection.json'], { stdout: 'ignore', stderr: 'inherit' });
        if (await p.exited) throw Error('Finite-state parser');
        const scan = await Bun.file(t.dir + '/state-inspection.json').json();
        result.final_state = { finite: scan.total_nan === 0 && scan.total_inf === 0, swa_max_cells: Math.max(...scan.layers.filter(l => l.cache === 1).map(l => l.cells)), parsed_bytes: scan.parsed_bytes, size: scan.size };
        if (!result.final_state.finite || result.final_state.swa_max_cells > 768 || scan.parsed_bytes !== scan.size) throw Error('Candidate final KV integrity');
    }
} catch (e) { t.error ||= String(e); console.error(e); }
finally { const r = await t.finish(result); if (!r.ok) process.exitCode = 1; }
