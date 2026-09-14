/** SCRIPT_JDOC:
{"summary":"Verify original Gemma service identity, config hashes, loaded libraries and idle slots after maintenance","kind":"read-only","weight":"lightweight","role":"entrypoint"}
*/
import { readFileSync, readlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = import.meta.dir;
const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
const assert = (v: unknown, message: string) => { if (!v) throw Error(message); };
async function command(args: string[]) {
    const p = Bun.spawn(args, { stdout: 'pipe', stderr: 'inherit' });
    const out = await new Response(p.stdout).text();
    assert(await p.exited === 0, args.join(' '));
    return out.trim();
}
const service = await command(['systemctl', '--user', 'show', 'llama-gemma-local-provider.service', '-p', 'ActiveState', '-p', 'MainPID', '-p', 'NRestarts', '-p', 'FragmentPath']);
const props = Object.fromEntries(service.split('\n').map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));
assert(props.ActiveState === 'active' && Number(props.MainPID) > 0 && props.NRestarts === '0', 'Service state');
const pid = Number(props.MainPID);
const argv = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean);
assert(argv.join('\n') === readFileSync(root + '/baseline/argv.txt', 'utf8').trimEnd(), 'Original argv changed');
assert(readlinkSync(`/proc/${pid}/exe`) === argv[0], 'Executable identity');
const config = [
    ['service.unit', props.FragmentPath],
    ['service.env', process.env.HOME + '/.config/llama-gemma-local-provider/service.env'],
].map(([name, path]) => ({ name, saved_sha256: sha(root + '/baseline/' + name), live_sha256: sha(path) }));
assert(config.every(r => r.saved_sha256 === r.live_sha256), 'Original configuration changed');
const maps = readFileSync(`/proc/${pid}/maps`, 'utf8');
const reference = readFileSync(root + '/../gemma-deployment-20260906/rollback/loaded-library-sha256.txt', 'utf8').trim().split('\n');
const libraries = reference.map(line => {
    const m = line.match(/^([0-9a-f]{64})\s+(.+)$/)!;
    const path = m[2];
    return { path, expected_sha256: m[1], actual_sha256: sha(path), mapped: maps.includes(path) };
});
assert(libraries.length >= 8 && libraries.every(r => r.mapped && r.expected_sha256 === r.actual_sha256), 'Original library identity changed');
assert(!maps.includes('gemma-gpu-attention-20260910/runtime'), 'Experimental runtime mapped in production');
const swapKiB = Number(readFileSync(`/proc/${pid}/status`, 'utf8').match(/^VmSwap:\s+(\d+)/m)?.[1] ?? Infinity);
assert(swapKiB === 0, 'Production process swap');
const health = await fetch('http://127.0.0.1:8091/health').then(r => r.json());
const slots = await fetch('http://127.0.0.1:8091/slots').then(r => r.json());
assert(health.status === 'ok' && slots.length === 2 && slots.every(s => !s.is_processing && s.n_ctx === 131072), 'Health/idle slot configuration');
const result = { verified_at: new Date().toISOString(), pass: true, pid, props, config, libraries, argv, swap_kib: swapKiB, health, slots };
writeFileSync(root + '/restoration-identity.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ pass: true, pid, swap_kib: swapKiB, libraries: libraries.length, slots: slots.length }));
