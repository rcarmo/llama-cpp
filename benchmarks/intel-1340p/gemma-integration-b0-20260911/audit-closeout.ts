/** SCRIPT_JDOC:
{"summary":"Audit raw cancellation, capacity, timeout, code identity and final B0 restoration without inference","kind":"read-only","weight":"lightweight","role":"entrypoint"}
*/
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { audit as recoveryAudit } from './audit-recovery';
export function audit(root: string, overrides: Record<string, string> = {}) {
 const text = (p: string) => overrides[p] ?? readFileSync(root + '/' + p, 'utf8');
 const read = (p: string) => JSON.parse(text(p));
 const sha = (s: string) => createHash('sha256').update(s).digest('hex');
 const assert = (v: unknown, s: string) => { if (!v) throw Error(s); };
 const base = recoveryAudit(root), extra = read('runs/native-recovery-start-save/result.json');
 assert(extra.ok && extra.rows.length === 2, 'Startup/save result');
 for (const r of extra.rows) {
  const phase = read('runs/native-recovery-start-save/phase-' + r.label + '.json');
  assert(r.pass && r.phaseSeen && r.owners === 0 && r.wall_ms < 120000, 'Bounded phase ' + r.label);
  assert(phase.status === 499 && phase.phaseSeen && !phase.guard_error && phase.fatal.length === 0, 'Raw cancellation ' + r.label);
 }
 const startup = read('runs/native-recovery-start-save/startup-observation.json'), save = read('runs/native-recovery-start-save/save-observation.json');
 assert(startup.pid > 0 && startup.exitCode === null && startup.signalCode === null, 'Live startup worker');
 assert(save.pid > 0 && save.path === '/slots/0?action=save', 'Pending save request');
 const remaining = read('runs/native-recovery-remaining/result.json');
 const before = remaining.rows.find(x => x.label === 'owner-alternation-eviction'), after = remaining.rows.find(x => x.label === 'CPU-SIGKILL-detected-new-controller');
 assert(before.owners === 2 && after.cpu_pid !== before.cpu_pid, 'Owner occupancy and CPU recreation');
 assert(remaining.rows.find(x => x.label === 'owner-A' && x.route === 'cpu-owner'), 'Actual established-owner reuse');
 assert(read('runs/native-recovery-sized/guard-stop.json').reason === 'Error: Missing counter VmRSS', 'Preserve monitor failure');
 assert(!read('runs/native-recovery/result.json').ok && text('recovery-stage.log').includes('Phase not reached gpu-ready'), 'Preserve insufficient fixture');
 const cap = read('runs/dual-slot-capacity/result.json');
 for (const row of cap.rows) {
  const n = row.tokens_per_slot;
  for (const slot of [0, 1]) {
   const r = read(`runs/dual-slot-capacity/restore-${n}-slot${slot}.json`);
   assert(r.response.n_read > 0 && r.measurement.n_read === r.response.n_read, 'Native restore bytes');
  }
  for (let i = 0; i < 3; i++) {
   const slot = [0, 1, 0][i], r = read(`runs/dual-slot-capacity/reuse-${n}-slot${slot}-${i}.json`);
   assert(r.request.prompt.length === n && r.request.id_slot === slot, 'Raw occupied prompt/slot');
   assert(r.response.timings.cache_n === n - 1 && r.response.timings.prompt_n === 1 && r.response.timings.predicted_n === 1, 'Raw exact native reuse');
   assert(row.perSlot[i].cache === r.response.timings.cache_n && row.perSlot[i].content === r.response.content, 'Rollup matches raw');
  }
  const finite = read('support/finite-' + n + '.json');
  assert(finite.total_nan === 0 && finite.total_inf === 0 && finite.parsed_bytes === finite.size, 'Inherited finite EOF ' + n);
 }
 const identities = read('input-identities.json'), cfg = read('support/deployed-config.json');
 for (const c of identities.code) assert(sha(text('code/' + c.file)) === c.sha256 && c.sha256 === c.deployed_sha256, 'Deployed source ' + c.file);
 assert(identities.fixture.prompt_tokens === 130000 && identities.fixture.base_tokens === 64663 && identities.fixture.prefix_identical, 'Genuine extended fixture');
 const frozen = read('support/frozen-inputs.json');
 assert(identities.states.find(s => s.path.endsWith('prefix-64663-v2.slot')).sha256 === frozen.model_and_fixture_files.find(s => s.path.endsWith('long64-v2.slot')).sha256, 'Retained 64K state hash');
 for (const name of ['native-recovery-sized','native-recovery-remaining','native-recovery-start-save','dual-slot-capacity','near128-real-prefix']) {
  const gpu = name === 'near128-real-prefix', prov = read(`runs/${name}/runtime-provenance.json`);
  const expected = new Set(Object.values(cfg[gpu ? 'gpu' : 'cpu'].hashes));
  assert(prov.files.length >= 8 && prov.files.every(f => expected.has(f.sha256)), 'Mapped B0 library identities ' + name);
  assert(gpu ? prov.flags.includes('GGML_VK_EXPERIMENTAL_ATTN_MODE=f32') : ['LLAMA_EXPERIMENTAL_SMALL_TARGET_BATCH=1','GGML_CPU_EXPERIMENTAL_ATTN4=1','GGML_CPU_EXPERIMENTAL_SCORE4_3ROW=1'].every(f => prov.flags.includes(f)), 'B0 flags ' + name);
 }
 const hist = read('support/historical-recovery-results.json'), compare = read('historical-code-comparison.json');
 assert(hist.pass && hist.rows.some(r => r.label === 'native-prefill-cancel' && r.pass) && hist.rows.some(r => r.label === 'recovered' && r.status === 200), 'Historical recovery outcomes');
 assert(hist.rows.some(r => r.label === 'native-gpu-kill-fallback' && r.status === 200 && r.route === 'cpu-fallback'), 'Historical native GPU fallback');
 assert(hist.rows.some(r => r.label === 'native-cpu-generation-restart' && r.before.cpu_pid !== r.after.cpu_pid && r.before.pid !== r.after.pid), 'Historical systemd/controller restart');
 for (const r of compare.rows) assert(sha(text('code/' + r.file)) === r.current_sha256 && (r.file === 'workers.ts' ? sha(text('support/historical-workers.ts')) === r.old_sha256 : r.identical && r.old_sha256 === r.current_sha256), 'Historical code comparison');
 const near = read('runs/near128-real-prefix/result.json'), log = text('runs/near128-real-prefix/vulkan.log');
 const progress = [...log.matchAll(/n_tokens =\s+(\d+), progress = ([\d.]+), t =\s+([\d.]+) s/g)].map(m => ({ evaluated: +m[1], progress: +m[2], seconds: +m[3] }));
 const last = progress.at(-1)!;
 assert(!near.ok && near.error.includes('TimeoutError') && last.evaluated === 57344 && last.seconds < 1201, 'Bounded incomplete near128');
 assert(near.calls.length === 1 && near.calls[0].label === 'restore64' && !identities.near128_saved && !existsSync(root + '/runs/near128-real-prefix/finite-scan.json'), 'No near128 success fabricated');
 assert(log.includes('cancel task') && !existsSync(root + '/runs/near128-real-prefix/guard-stop.json'), 'Timeout cancellation, no resource guard');
 const names = ['native-recovery-remaining','native-recovery-start-save','dual-slot-capacity','near128-real-prefix'];
 for (const name of names) {
  const r = read(`runs/${name}/result.json`), samples = read(`runs/${name}/samples.json`);
  assert(samples.length > 0 && samples.every(s => s.mem_available_kib >= 6 * 1048576 && s.servers.every(p => p.swap_kib <= 16384)), 'Raw resource limits ' + name);
  assert(r.resources.min_available_kib === Math.min(...samples.map(s => s.mem_available_kib)), 'Resource rollup ' + name);
 }
 const restored = read('restoration-check.json'), final = read('final-state.json');
 assert(restored.pass && restored.swap_kib === 0 && restored.libraries.length === 9 && restored.libraries.every(l => l.mapped && l.expected === l.actual), 'Restored B0 maps');
 assert(sha(text('support/deployed-config.json')) === restored.config_sha256 && sha(text('support/deployed.service.txt')) === restored.unit_sha256, 'Unchanged deployed config/unit');
 assert(names.every(n => Date.parse(restored.verified_at) > Date.parse(read(`runs/${n}/result.json`).finished_at)), 'Restoration after all attempts');
 assert(final.pass && final.cpu_pid === restored.info.cpu_pid && final.swap_kib === 0 && final.orphans.length === 0, 'Final idle owned cleanup');
 return { audit_pass: true, baseline: 'B0-score3', deployment_changed: false, recovery: { current_labels: [...base.current_native_labels, ...extra.rows.map(r => r.label)], historical_labels: hist.rows.map(r => r.label), peak_swap_kib: Math.max(extra.resources.peak_trial_swap_kib, remaining.resources.peak_trial_swap_kib), peak_c: Math.max(extra.thermal.peak_c, remaining.thermal.peak_c) }, capacity: cap.rows.map(r => ({ tokens_per_slot: r.tokens_per_slot, memory: r.memory })), near128: { qualified: false, terminal: '20-minute request timeout', last_progress: last, resources: near.resources }, restored: { verified_at: restored.verified_at, cpu_pid: restored.info.cpu_pid, supervisor_pid: restored.info.pid, final_observed_at: final.at }, limits: ['Current recovery uses directRequest with real native workers; historical wire/supervisor coverage is reused by source identity', 'Startup health-wait and save/restore HTTP-pending boundaries do not instrument internal model-load/file-I/O progress', 'Synchronous conversion is cancellation-tested only at its boundaries', 'Recovery GPU process maps were not captured; Workers hashes pinned runtime files before spawn; capacity GPU maps were captured', 'CPU capacity uses cacheRAM0 and the same finite state in independent slots; full production12GiB cache pressure is unqualified', 'No completed near128 state, finite scan, CPU handoff, dual128 occupancy or fallback timing; no broad long-context task-quality claim'] };
}
if (import.meta.main) {
 const result = audit(import.meta.dir);
 writeFileSync(import.meta.dir + '/results.json', JSON.stringify(result, null, 2) + '\n');
 console.log('PASS raw native recovery, dual16/32/64K, bounded near128 timeout, provenance and B0 restoration');
}
