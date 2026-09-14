import { test, expect } from 'bun:test';
import { verifyControl } from './vulkan-control-output';
function fixture(arm: 'off' | 'on') {
    const stdout = ['10240 256 2560', '2560 256 10240'].flatMap(shape => [
        `GATE ${shape} 2.2e-7`, ...Array.from({ length: 8 }, (_, i) => `TIMING ${shape} ${i} 1.25`), `RESULT ${shape} 2.2e-7 0.001`,
    ]).concat('OWNERS_DRAINED').join('\n') + '\n';
    const tile = arm === 'on' ? 'l' : 'm', size = arm === 'on' ? 128 : 64;
    const stderr = Array(4).fill(`XE_FFN_DISPATCH m=10240 n=256 k=2560 pipeline=matmul_q4_0_q8_1_${tile} query_type=q8_1 wg_m=${size} wg_n=${size} split_k=1`).join('\n');
    return { stdout, stderr };
}
test('both arms require finite gates, complete repetitions and explicit drain', () => {
    for (const arm of ['off', 'on'] as const) {
        const f = fixture(arm), r = verifyControl(f.stdout, f.stderr, arm);
        expect(r.results.length).toBe(2); expect(r.timing_qualified).toBe(false);
        expect(() => verifyControl(f.stdout.replace('OWNERS_DRAINED', ''), f.stderr, arm)).toThrow();
        expect(() => verifyControl(f.stdout.replace('2.2e-7', 'NaN'), f.stderr, arm)).toThrow();
        expect(() => verifyControl(f.stdout.replace('2.2e-7', '0.01'), f.stderr, arm)).toThrow();
        expect(() => verifyControl(f.stdout.replace('TIMING 10240 256 2560 0 1.25\n', ''), f.stderr, arm)).toThrow();
    }
});
test('wrong pipeline, tile geometry and premature timing fail', () => {
    const f = fixture('off');
    expect(() => verifyControl(f.stdout, f.stderr, 'on')).toThrow();
    expect(() => verifyControl(f.stdout, f.stderr.replaceAll('wg_n=64', 'wg_n=32'), 'off')).toThrow();
    expect(() => verifyControl(f.stdout.replace('GATE 10240 256 2560 2.2e-7\n', '').replace('RESULT 10240', 'GATE 10240 256 2560 2.2e-7\nRESULT 10240'), f.stderr, 'off')).toThrow();
});
