/** SCRIPT_JDOC:
{"summary":"Validate Vulkan control probe correctness, complete samples, dispatch and owner-drain protocol","kind":"read-only","weight":"lightweight","role":"module"}
*/
import { strict as assert } from 'node:assert';
export function verifyControl(stdout: string, stderr: string, arm: 'off' | 'on') {
    const lines = stdout.trim().split('\n');
    assert.equal(lines.filter(x => x === 'OWNERS_DRAINED').length, 1, 'owner drain marker');
    assert.equal(lines.at(-1), 'OWNERS_DRAINED', 'owner drain must be final');
    const shapes = ['10240 256 2560', '2560 256 10240'];
    const results = shapes.map(shape => {
        const gates = lines.filter(x => x.startsWith('GATE ' + shape + ' '));
        const results = lines.filter(x => x.startsWith('RESULT ' + shape + ' '));
        assert.equal(gates.length, 1); assert.equal(results.length, 1);
        const gate = Number(gates[0].split(' ')[4]), nmse = Number(results[0].split(' ')[4]);
        assert.ok(Number.isFinite(gate) && gate >= 0 && gate <= 5e-4);
        assert.ok(Number.isFinite(nmse) && nmse >= 0 && nmse <= 5e-4);
        const maxAbs = Number(results[0].split(' ')[5]);
        assert.ok(Number.isFinite(maxAbs) && maxAbs >= 0);
        const timings = lines.filter(x => x.startsWith('TIMING ' + shape + ' '));
        assert.equal(timings.length, 8);
        const ms = timings.map((line, i) => {
            assert.ok(lines.indexOf(gates[0]) < lines.indexOf(line), 'numerical gate before timing');
            assert.equal(Number(line.split(' ')[4]), i);
            const value = Number(line.split(' ')[5]); assert.ok(Number.isFinite(value) && value > 0);
            return value;
        });
        return { shape, gate_nmse: gate, nmse, max_abs: maxAbs, diagnostic_ms: ms };
    });
    // The retained plugin prints only its first four dispatches, all for the first shape.
    const traces = stderr.split('\n').filter(x => x.startsWith('XE_FFN_DISPATCH '));
    assert.equal(traces.length, 4);
    const tile = arm === 'on' ? 'l' : 'm', size = arm === 'on' ? 128 : 64;
    for (const line of traces) {
        assert.ok(line.includes('m=10240 n=256 k=2560 '));
        assert.ok(line.includes(`pipeline=matmul_q4_0_q8_1_${tile} `));
        assert.ok(line.includes(`wg_m=${size} wg_n=${size} split_k=1`));
    }
    return { arm, results, traces, timing_qualified: false,
        limitation: 'O0 plugin and dispatch trace: diagnostic samples only; trace cap covers first shape only.' };
}
