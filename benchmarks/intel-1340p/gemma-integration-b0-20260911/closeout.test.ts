import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { audit } from './audit-closeout';
const root = import.meta.dir;
function mutate(path: string, fn: (x: any) => void) {
 const x = JSON.parse(readFileSync(root + '/' + path, 'utf8')); fn(x);
 return { [path]: JSON.stringify(x) };
}
test('closed bounded campaign preserves B0, passing capacity and failed near128', () => {
 const r = audit(root);
 expect(r.audit_pass).toBe(true); expect(r.deployment_changed).toBe(false);
 expect(r.capacity.map(x => x.tokens_per_slot)).toEqual([16384, 32768, 64663]);
 expect(r.near128.qualified).toBe(false); expect(r.near128.last_progress.evaluated).toBe(57344);
 expect(r.recovery.current_labels).toContain('save-inflight');
 expect(r.recovery.current_labels).toContain('startup-inflight');
 expect(r.recovery.peak_swap_kib).toBeLessThanOrEqual(16384);
});
test('reject invented near128 success', () => expect(() => audit(root, mutate('runs/near128-real-prefix/result.json', x => x.ok = true))).toThrow('Bounded incomplete'));
test('reject capacity rollup hiding raw cache loss', () => expect(() => audit(root, mutate('runs/dual-slot-capacity/reuse-64663-slot0-0.json', x => x.response.timings.cache_n = 0))).toThrow('Raw exact native reuse'));
test('reject unsampled or swapped resource claim', () => expect(() => audit(root, mutate('runs/native-recovery-start-save/samples.json', x => x.find(s => s.servers.length).servers[0].swap_kib = 16385))).toThrow('Raw resource limits'));
test('reject phase label without actual cancellation response', () => expect(() => audit(root, mutate('runs/native-recovery-start-save/phase-save-inflight.json', x => x.status = 502))).toThrow('Raw cancellation'));
test('reject changed library provenance', () => expect(() => audit(root, mutate('runs/dual-slot-capacity/runtime-provenance.json', x => x.files[0].sha256 = '0'.repeat(64)))).toThrow('Mapped B0 library identities'));
test('reject stale final restoration', () => expect(() => audit(root, mutate('restoration-check.json', x => x.verified_at = '2026-09-11T08:00:00Z'))).toThrow('Restoration after all attempts'));
