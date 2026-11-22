import assert from 'node:assert/strict';
import { records, parseTrace, selectionEstimates } from './audit-dispatch.mjs';
let cases = 0;
const test = (name, fn) => { fn(); cases++; console.log('PASS ' + name); };
const cri = (text, stream = 'stderr', flag = 'F') => '2026-11-22T00:00:00.000000000+00:00 ' + stream + ' ' + flag + ' ' + text + '\n';
const weight = { name: 'blk.6.ffn_down_exps.weight', allocated_bytes: 191102976 };
const config = cri('BENCH_CONFIG reps=1', 'stdout');
const nodes = [
    '## SPLIT #0: CPU # 0 inputs',
    'node # 0 (       ADD): foo (   1K) [  CPU         ] use=1,c=1:',
    '## SPLIT #1: Vulkan0 # 1 inputs: [blk.6.ffn_down_exps.weight ( 182M)] ',
    'node # 1 (MUL_MAT_ID): foo (   1K) [Vulka         ] use=1,c=1:',
    'node # 2 (MUL_MAT_ID): foo (   1K) [Vulka         ] use=1,c=1:',
    'node # 3 (MUL_MAT_ID): foo (   1K) [Vulka         ] use=1,c=1:',
    'node # 4 (       ADD): foo (   1K) [Vulka         ] use=1,c=0:',
];
const block = nodes.map(s => cri(s)).join('');
const phase = () => cri('REPLAY_PHASE begin tokens=128 pos=0') + block + cri('REPLAY_PHASE end tokens=128 pos=0');
const log = config + block + phase() + phase() + cri('WORKLOAD_WARMUP_COMPLETE', 'stdout');

test('CRI partial reassembly preserves per-stream payload', () => {
    const result = records(cri('hel', 'stderr', 'P') + cri('out', 'stdout') + cri('lo', 'stderr'));
    assert.deepEqual(result.map(r => r.text), ['out', 'hello']);
});
test('partial split input is parsed after assembly', () => {
    const complete = cri(nodes[2]);
    const split = cri(nodes[2].slice(0, 39), 'stderr', 'P') + cri(nodes[2].slice(39));
    assert.equal(parseTrace(log.replaceAll(complete, split), [weight]).graphs[1].gpu_weight_input_bytes, weight.allocated_bytes);
});
test('truncated partial and malformed records fail closed', () => {
    assert.throws(() => records(cri('unfinished', 'stderr', 'P')), /Truncated/);
    assert.throws(() => records('not a CRI record\n'), /Malformed/);
});
test('three loop matmuls have one declared weight-copy input', () => {
    const graph = parseTrace(log, [weight]).graphs[1];
    assert.equal(graph.gpu_active_ops.MUL_MAT_ID, 3);
    assert.equal(graph.gpu_weight_input_count, 1);
    assert.equal(graph.gpu_weight_input_bytes, weight.allocated_bytes);
    assert.equal(graph.gpu_active_ops.ADD, undefined);
});
test('reservation, warmup and measured graphs stay separate despite buffered stdout', () => {
    const result = parseTrace(log, [weight]);
    assert.deepEqual(result.graphs.map(g => g.sample), ['outside', 'warmup', 'measured']);
    assert.equal(result.calls.length, 2);
});
test('input-count mismatch fails closed', () => {
    assert.throws(() => parseTrace(log.replace('# 1 inputs:', '# 2 inputs:'), [weight]), /input-count mismatch/);
});
test('unknown weight and inconsistent exact size fail closed', () => {
    assert.throws(() => parseTrace(log, []), /missing from exact layout/);
    assert.throws(() => parseTrace(log, [{ ...weight, allocated_bytes: 1024 }]), /size\/layout mismatch/);
});
test('unclosed and nested phases fail closed', () => {
    assert.throws(() => parseTrace(config + cri('REPLAY_PHASE begin tokens=128 pos=0') + block, [weight]), /Unclosed/);
    assert.throws(() => parseTrace(config + cri('REPLAY_PHASE begin tokens=128 pos=0') + phase(), [weight]), /Nested/);
});
test('duplicate weight-copy inputs cannot masquerade as deduplication', () => {
    const duplicate = nodes[2].replace('SPLIT #1', 'SPLIT #2');
    assert.throws(() => parseTrace(log.replaceAll(block, block + cri(duplicate)), [weight]), /not deduplicated/);
});
test('selection estimate separates physical storage and loop visits', () => {
    const result = selectionEstimates([weight, { name: 'blk.6.attn_q.weight', allocated_bytes: 4096 }]);
    assert.equal(result[0].microbatches, 4);
    assert.equal(result[0].conditional_scheduler_copy_bytes, weight.allocated_bytes * 4);
    assert.equal(result[0].naive_per_visit_copy_bytes, weight.allocated_bytes * 12);
    assert.throws(() => selectionEstimates([weight], 512, 0), /Invalid/);
});
console.log('PASS ' + cases + ' offline audit regression cases; no native model work');
