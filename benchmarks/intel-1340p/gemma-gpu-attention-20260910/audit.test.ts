import { test, expect } from 'bun:test';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { audit } from './audit-results';
const root = import.meta.dir;
test('retained complete evidence reproduces numerical and timing results', () => {
    const r = audit(root);
    expect(r.audit_pass).toBe(true);
    expect(r.confirmation_complete).toBe(true);
    expect(r.tail_prefill_reduction_pct).toBeCloseTo(8.102351695, 6);
    expect(r.full64_reduction_pct).toBeCloseTo(7.422405419, 6);
    expect(r.native.map(n => n.passed)).toEqual([4, 4, 6]);
    expect(r.restoration.pass).toBe(true);
});
test('audit rejects incorrect cache reuse even when the stored pass flag is true', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gemma-attention-audit-'));
    try {
        for (const name of ['screen64-base', 'screen64-small', 'screen64-f32', 'attention-native-controls', 'confirm64-0-base']) {
            cpSync(root + '/runs/' + name + '/result.json', dir + '/' + name + '.json');
        }
        // Supply only the files reached before the altered confirmation fails.
        const { mkdirSync } = require('node:fs');
        for (const name of ['screen64-base', 'screen64-small', 'screen64-f32', 'attention-native-controls', 'confirm64-0-base']) {
            mkdirSync(dir + '/runs/' + name, { recursive: true });
            cpSync(dir + '/' + name + '.json', dir + '/runs/' + name + '/result.json');
        }
        for (const mode of ['base', 'small', 'f32']) cpSync(root + '/runs/attention-native-controls/' + mode + '.log', dir + '/runs/attention-native-controls/' + mode + '.log');
        const path = dir + '/runs/confirm64-0-base/result.json';
        const r = JSON.parse(readFileSync(path, 'utf8')); r.rows[0].timings.cache_n = 0;
        writeFileSync(path, JSON.stringify(r));
        expect(() => audit(dir)).toThrow('Confirm recall/cache coverage');
    } finally { rmSync(dir, { recursive: true, force: true }); }
});
