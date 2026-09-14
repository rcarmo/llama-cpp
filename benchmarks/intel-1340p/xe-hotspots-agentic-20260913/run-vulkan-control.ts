/** SCRIPT_JDOC:
{"summary":"Run admitted same-plugin Vulkan OFF/ON correctness probes with strict resource guards and explicit backend-owner drain handshake","kind":"mixed","weight":"heavy","role":"entrypoint"}
*/
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { workerStatus, counter } from './q4-guard';
import { verifyControl } from './vulkan-control-output';
const root = import.meta.dir, id = process.argv[2];
if (!/^vulkan-large-offon(?:-r[1-9])?$/.test(id || '')) throw Error('Invalid run ID');
const admission = JSON.parse(readFileSync(root + '/vulkan-control-admission.json', 'utf8'));
if (admission.run_id !== id || !Number.isFinite(Date.parse(admission.expires)) || Date.now() >= Date.parse(admission.expires)) throw Error('Fresh exact admission required');
const dir = root + '/' + id, bin = root + '/vulkan-large-build/test-vulkan-control';
if (existsSync(dir)) throw Error('Retained run exists');
mkdirSync(dir);
const text = (p: string) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };
const hash = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
const save = (p: string, x: unknown) => writeFileSync(dir + '/' + p, JSON.stringify(x, null, 2) + '\n');
const env = { PATH: '/usr/bin:/bin', HOME: process.env.HOME!, XDG_RUNTIME_DIR: '/run/user/1001', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1001/bus',
    LD_LIBRARY_PATH: '/var/home/agent/workspace/reports/xe-in-memory-perf-20260913/release/bin:/var/home/agent/workspace/reports/gemma-simd-async-20260906/build-vulkan/runtime',
    GGML_BACKEND_PATH: root + '/vulkan-large-build/libggml-vulkan.so.0.23.0', GGML_XE_VK_TRACE: '1' };
async function services() {
    const child = Bun.spawn(['systemctl', '--user', 'show', 'llama-gemma-local-provider.service', 'whisper-stt.service', 'whisper-stt-diarizer.service', '-p', 'Id', '-p', 'ActiveState', '-p', 'MainPID'], { env, stdout: 'pipe' });
    const value = await new Response(child.stdout).text(); if (await child.exited) throw Error('Service inspect failed'); return value;
}
const beforeServices = await services();
if ((beforeServices.match(/ActiveState=inactive/g) || []).length !== 3) throw Error('Service busy');
const cg = text('/proc/self/cgroup').trim().split('::')[1], base = '/sys/fs/cgroup' + cg;
if (!cg) throw Error('Missing cgroup');
const counters = () => ({ cpu: text(base + '/cpu.stat'), quota: text(base + '/cpu.max'), swap: text(base + '/memory.swap.current'), swap_peak: text(base + '/memory.swap.peak'), memory_peak: text(base + '/memory.peak'), memory_events: text(base + '/memory.events') });
const before = counters(); if (!before.quota.startsWith('max ')) throw Error('Unexpected CPU quota'); counter(before.cpu, 'nr_throttled');
save('manifest.json', { id, admission, at: new Date().toISOString(), argv: [bin], env, cgroup: cg, before, beforeServices,
    hashes: Object.fromEntries(['vulkan-ffn-control.cpp', 'run-vulkan-control.ts', 'vulkan-control-output.ts', 'q4-guard.ts', 'launch-vulkan-control.sh', 'vulkan-large-build/ggml-vulkan.cpp', 'vulkan-large-build/test-vulkan-control', 'vulkan-large-build/libggml-vulkan.so.0.23.0'].map(p => [p, hash(root + '/' + p)])) });
let abort = '', child: ReturnType<typeof Bun.spawn> | undefined, drained = false, timer: ReturnType<typeof setInterval> | undefined;
const samples: any[] = [], results: any[] = [], start = performance.now();
function stop(why: string) { abort ||= why; if (child) try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
function sample(arm: string) {
    const available = Number(text('/proc/meminfo').match(/^MemAvailable:\s+(\d+)/m)?.[1]);
    const status = child ? text(`/proc/${child.pid}/status`) : '';
    const worker = workerStatus(status), cgroup = counters();
    const competitors = readdirSync('/proc').filter(p => /^\d+$/.test(p) && ['go', 'llama-server', 'whisper-cli', 'diar-server', 'ffmpeg', 'python', 'python3', 'agentic-session'].includes(text(`/proc/${p}/comm`).trim()));
    let threads: any[] = [];
    if (child && !worker.exited) try { threads = readdirSync(`/proc/${child.pid}/task`).map(t => ({ tid: t, allowed: text(`/proc/${child!.pid}/task/${t}/status`).match(/^Cpus_allowed_list:\s+(.+)/m)?.[1] })); } catch {}
    samples.push({ arm, at: new Date().toISOString(), available_kib: available, worker, rss_kib: Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1]), cgroup, competitors, threads });
    if (!Number.isFinite(available) || available < 6 * 1048576) stop('available memory');
    if (worker.violation) stop('worker swap');
    if (!/^\d+\s*$/.test(cgroup.swap) || Number(cgroup.swap) > 16 * 1048576) stop('cgroup swap');
    if (['oom', 'oom_kill', 'max'].some(key => counter(cgroup.memory_events, key) > counter(before.memory_events, key))) stop('cgroup memory events');
    if (competitors.length) stop('contention ' + competitors.join(','));
    if (child && !worker.exited) { const maps = text(`/proc/${child.pid}/maps`); if (maps.includes(env.GGML_BACKEND_PATH)) writeFileSync(dir + '/' + arm + '-maps.txt', maps); }
}
for (const sig of ['SIGTERM', 'SIGINT'] as const) process.on(sig, () => stop(sig));
const deadline = setTimeout(() => stop('deadline'), 85000);
try {
    for (const arm of ['off', 'on'] as const) {
        if (Date.now() >= Date.parse(admission.expires)) throw Error('Admission expired');
        child = undefined; sample(arm); if (abort) throw Error(abort);
        drained = false;
        child = Bun.spawn([bin], { env: { ...env, GGML_XE_Q4_LARGE: arm === 'on' ? '1' : '0' }, detached: true, stdin: 'pipe', stdout: 'pipe', stderr: Bun.file(dir + '/' + arm + '-stderr.log') });
        timer = setInterval(() => { try { sample(arm); } catch (error) { stop('monitor ' + String(error)); } }, 50);
        let stdout = '', pending = '';
        const reader = (async () => {
            const decoder = new TextDecoder();
            for await (const chunk of child!.stdout as ReadableStream<Uint8Array>) {
                const decoded = decoder.decode(chunk, { stream: true }); stdout += decoded; pending += decoded;
                let i: number;
                while ((i = pending.indexOf('\n')) >= 0) {
                    const line = pending.slice(0, i); pending = pending.slice(i + 1);
                    if (line === 'OWNERS_DRAINED') {
                        if (drained) throw Error('Duplicate drain marker');
                        // Process is alive waiting for close; take a final strict live sample.
                        sample(arm); drained = true; clearInterval(timer); timer = undefined;
                        child!.stdin.write('close\n'); child!.stdin.end();
                    }
                }
            }
            stdout += decoder.decode();
        })().catch(error => { stop('stdout ' + String(error)); });
        const rc = await child.exited; await reader; clearInterval(timer); timer = undefined;
        writeFileSync(dir + '/' + arm + '-stdout.txt', stdout);
        results.push({ arm, rc, drained });
        if (rc || abort || !drained) throw Error(`Worker rc=${rc}, drain=${drained}, abort=${abort}`);
        if (!text(dir + '/' + arm + '-maps.txt').includes(env.GGML_BACKEND_PATH)) throw Error('Expected plugin mapping missing');
        Object.assign(results.at(-1), verifyControl(stdout, text(dir + '/' + arm + '-stderr.log'), arm));
    }
} catch (error) { stop(String(error)); if (child) await child.exited; }
finally { clearInterval(timer); clearTimeout(deadline); }
const after = counters(), afterServices = await services();
const throttle = counter(after.cpu, 'nr_throttled') - counter(before.cpu, 'nr_throttled');
if (beforeServices !== afterServices) abort ||= 'services changed';
if (throttle) abort ||= 'CPU throttled';
save('result.json', { id, abort, pass: !abort && results.length === 2, wall_ms: performance.now() - start, results, samples, before, after, throttle_delta: throttle, services_unchanged: beforeServices === afterServices });
console.log(JSON.stringify({ id, abort, arms: results.length, throttle }));
if (abort || results.length !== 2) process.exitCode = 1;
