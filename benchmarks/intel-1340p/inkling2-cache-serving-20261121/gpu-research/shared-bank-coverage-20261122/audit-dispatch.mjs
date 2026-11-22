import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const check = (ok, message) => { if (!ok) throw Error(message); };
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export function records(text) {
    const pending = new Map(), result = [];
    for (const [index, raw] of text.split('\n').entries()) {
        if (!raw) continue;
        const match = raw.match(/^(\S+) (stdout|stderr) ([PF]) (.*)$/);
        check(match, 'Malformed CRI record at ' + (index + 1));
        const [, timestamp, stream, flag, payload] = match;
        const previous = pending.get(stream);
        const record = { timestamp, stream, first_raw_line: previous?.first_raw_line ?? index + 1, last_raw_line: index + 1, text: (previous?.text ?? '') + payload };
        if (flag === 'P') pending.set(stream, record);
        else { pending.delete(stream); result.push(record); }
    }
    check(pending.size === 0, 'Truncated CRI partial record');
    return result;
}

export function parseTrace(text, tensors) {
    const rows = records(text), graphs = [], calls = [];
    const layout = new Map(tensors.map(t => [t.name, t]));
    let graph = null, split = null, call = null, round = -1;
    for (const record of rows) {
        const line = record.text;
        let m = line.match(/^REPLAY_PHASE (begin|end) tokens=(\d+) pos=(\d+)$/);
        if (m) {
            const tokens = Number(m[2]), pos = Number(m[3]);
            if (m[1] === 'begin') {
                check(call === null, 'Nested replay phase');
                if (tokens > 1 && pos === 0) round++;
                call = { round, kind: tokens > 1 ? 'prefill' : 'decode', tokens, pos, graphs: [] };
                calls.push(call);
            } else {
                check(call && call.tokens === tokens && call.pos === pos, 'Mismatched phase end');
                call = null;
            }
            graph = null; split = null;
            continue;
        }
        m = line.match(/^## SPLIT #(\d+): (\S+) # (\d+) inputs(?:: (.*))?$/);
        if (m) {
            const id = Number(m[1]);
            if (id === 0) {
                graph = { ordinal: graphs.length, phase: call?.kind ?? 'reservation_or_outside', round: call?.round ?? null, tokens: call?.tokens ?? null, pos: call?.pos ?? null, splits: [] };
                graphs.push(graph); if (call) call.graphs.push(graph.ordinal);
            }
            check(graph && id === graph.splits.length, 'Nonsequential split ID');
            const inputs = [...(m[4] ?? '').matchAll(/\[([^\]]+)\]/g)].map(match => {
                const input = match[1].match(/^(.*) \(\s*(\d+)([MK])\)$/);
                check(input, 'Malformed split input: ' + match[1]);
                const name = input[1], tensor = layout.get(name);
                check(!name.endsWith('.weight') || tensor, 'Weight missing from exact layout: ' + name);
                if (tensor) {
                    const unit = tensor.allocated_bytes >= 1024 * 1024 ? 'M' : 'K';
                    const rounded = Math.floor(tensor.allocated_bytes / (unit === 'M' ? 1024 * 1024 : 1024)) + unit;
                    check(rounded === input[2] + input[3], 'Weight debug-size/layout mismatch: ' + name);
                }
                return { name, debug_size: input[2] + input[3], ...(tensor ? { weight_bytes: tensor.allocated_bytes } : {}) };
            });
            check(inputs.length === Number(m[3]), 'Split input-count mismatch');
            split = { id, backend: m[2], inputs, active_ops: {}, inactive_nodes: 0 };
            graph.splits.push(split);
            continue;
        }
        m = line.match(/^node #\s*\d+ \(([^)]+)\): .* use=\d+,c=([01]):/);
        if (m) {
            check(split, 'Node without split');
            if (m[2] === '1') { const op = m[1].trim(); split.active_ops[op] = (split.active_ops[op] ?? 0) + 1; }
            else split.inactive_nodes++;
        }
    }
    check(call === null, 'Unclosed replay phase');
    check(graphs.length > 0, 'No declared graphs');
    const config = rows.map(r => r.text).find(l => l.startsWith('BENCH_CONFIG '));
    check(config, 'Missing benchmark config');
    const reps = Number(config.match(/ reps=(\d+)$/)?.[1]);
    check(Number.isInteger(reps) && reps > 0, 'Missing repetition count');
    const prefill = calls.filter(c => c.kind === 'prefill');
    check(prefill.length === reps + 1, 'Expected one warmup plus measured prefills');
    const summaries = graphs.map(g => {
        const gpu = g.splits.filter(s => s.backend.startsWith('Vulkan'));
        const weights = gpu.flatMap(s => s.inputs.filter(i => i.weight_bytes !== undefined));
        const names = weights.map(w => w.name);
        check(new Set(names).size === names.length, 'Weight copy was not deduplicated within graph');
        const active = gpu.reduce((out, s) => { for (const [op, n] of Object.entries(s.active_ops)) out[op] = (out[op] ?? 0) + n; return out; }, {});
        let transitions = 0;
        for (let i = 1; i < g.splits.length; i++) if (g.splits[i].backend !== g.splits[i - 1].backend) transitions++;
        return { ordinal: g.ordinal, phase: g.phase, round: g.round, sample: g.round === null ? 'outside' : g.round === 0 ? 'warmup' : 'measured', tokens: g.tokens, pos: g.pos, splits: g.splits.length, backend_transitions: transitions, gpu_splits: gpu.length, gpu_active_ops: active, gpu_declared_inputs: gpu.reduce((n, s) => n + s.inputs.length, 0), gpu_weight_input_count: weights.length, gpu_weight_input_bytes: weights.reduce((n, w) => n + w.weight_bytes, 0), gpu_weight_inputs: weights };
    });
    return { cri_records: rows.length, cri_raw_lines: text.trimEnd().split('\n').length, config, calls, graphs: summaries, split_details: graphs };
}

export function selectionEstimates(tensors, prompt = 512, microbatch = 128) {
    check(Number.isSafeInteger(prompt) && prompt > 0 && Number.isSafeInteger(microbatch) && microbatch > 0, 'Invalid prompt/microbatch');
    return [
        ['group6', /^blk\.(6|7)\.ffn_(gate_up|down)_exps\.weight$/],
        ['dense', /^blk\.[0-9]+\.attn_(q|k|v|output)\.weight$/],
    ].map(([label, pattern]) => {
        const selected = tensors.filter(t => pattern.test(t.name));
        check(selected.length > 0, 'Empty selection');
        const unique = selected.reduce((n, t) => n + t.allocated_bytes, 0);
        const visits = selected.reduce((n, t) => { const layer = Number(t.name.match(/^blk\.(\d+)\./)[1]); return n + t.allocated_bytes * (layer >= 6 && layer <= 17 ? 3 : 1); }, 0);
        return { label, physical_tensors: selected.length, unique_weight_bytes: unique, loop_visit_weight_bytes: visits, microbatches: Math.ceil(prompt / microbatch), conditional_scheduler_copy_bytes: unique * Math.ceil(prompt / microbatch), naive_per_visit_copy_bytes: visits * Math.ceil(prompt / microbatch), scope: 'Source-derived estimate if all selected weights are supported/active and copied once per microbatch; not measured hardware traffic or timing.' };
    });
}

if (import.meta.main) {
    const ws = '/var/home/agent/workspace';
    const out = process.argv[2]; check(out && fs.existsSync(out), 'Existing output directory required');
    const old = ws + '/tmp/llama-cpp/runs/inkling-cache-gpu-20261121-1dadee62b';
    const layoutPath = ws + '/tmp/llama-cpp/runs/inkling2-mini-20261120-29b52d398/model-layout.json';
    const layout = JSON.parse(fs.readFileSync(layoutPath, 'utf8'));
    const runs = [];
    for (const label of ['gfallback-a1', 'gdown6-b1']) {
        check(fs.readFileSync(old + '/' + label + '.exit', 'utf8').trim() === '0', 'Retained failed arm');
        const file = old + '/' + label + '.native.log', bytes = fs.readFileSync(file);
        const result = parseTrace(bytes.toString(), layout.tensors);
        fs.writeFileSync(out + '/' + label + '.split-details.json', JSON.stringify(result.split_details, null, 2) + '\n');
        const { split_details, ...summary } = result;
        runs.push({ label, raw_path: file, raw_sha256: digest(bytes), ...summary });
    }
    const result = { generated: new Date().toISOString(), source_commit: '2d079cf5b759b325b75e4d958fc46ea240bfbec3', runtime_commit: '1dadee62b291391d7b6c230fa81f04a2358c6bf2', new_native_runs: 0, new_builds: 0, diagnostic_only: true, caveat: 'Declared graphs are not per-execution counters; cached graphs can execute without a new assignment dump. Bytes describe scheduler copy requirements, not measured DMA, CPU memcpy, hardware counters or exposed latency.', layout_path: layoutPath, layout_sha256: digest(fs.readFileSync(layoutPath)), runs, conditional_512_estimates: selectionEstimates(layout.tensors) };
    fs.writeFileSync(out + '/dispatch-audit.json', JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify({ runs: runs.map(r => ({ label: r.label, raw_lines: r.cri_raw_lines, records: r.cri_records, runtime_graphs: r.graphs.filter(g => g.phase !== 'reservation_or_outside') })), estimates: result.conditional_512_estimates }, null, 2));
}
