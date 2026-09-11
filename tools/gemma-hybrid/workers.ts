/** SCRIPT_JDOC:
{"summary":"Own pinned native Gemma workers, guarded GPU prefill and validated compact KV transfer","kind":"mixed","weight":"heavy","role":"module"}
*/
import { closeSync, openSync, readFileSync, readdirSync, mkdirSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { convertGemmaV3ToV2 } from './state';
import type { Backend } from './proxy';
import { processAlive as alive, convertedTokenCount } from './stream';
import { checkSpeechJobs, type SpeechMode } from './speech';
export type Profile = { argv: string[]; env: Record<string, string>; hashes: Record<string, string> };
export type Config = { host: string; port: number; cpuUrl: string; gpuUrl: string; stateDir: string; cpu: Profile; gpu: Profile; minGpu?: number; maxGpu?: number; speechMode?: SpeechMode };
const text = (p: string) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };
const num = (s: string, key: string) => Number(s.match(new RegExp('^' + key + ':\\s+(\\d+)', 'm'))?.[1] ?? 0);
export class Workers implements Backend {
    cpu: any; gpu: any; seq = 0; stopping = false; native = new Map<number, number>();
    gpuStop?: Promise<void>;
    constructor(public config: Config, public onFatal: (e: unknown) => void) {
        mkdirSync(config.stateDir, { recursive: true, mode: 0o700 });
        for (const name of readdirSync(config.stateDir)) if (/^transfer-[0-9]+(?:-v2)?\.slot(?:\.tmp)?$/.test(name)) unlinkSync(config.stateDir + '/' + name);
    }
    fatal(e: unknown) { if (!this.stopping) this.onFatal(e); }
    async start(which: 'cpu' | 'gpu') {
        if (this[which]) throw Error('Worker already started');
        const profile = this.config[which];
        for (const [path, expected] of Object.entries(profile.hashes)) if (createHash('sha256').update(readFileSync(path)).digest('hex') !== expected) throw Error('Pinned runtime hash mismatch');
        // Never inherit keychain/provider credentials in native model workers.
        const env: Record<string, string> = { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: process.env.HOME ?? '', LANG: 'C.UTF-8', ...profile.env };
        // Native request logs can contain prompts; use no persistent worker log in production.
        const p = Bun.spawn(profile.argv, { env, stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' });
        this[which] = p;
        if (which === 'cpu') p.exited.then(() => { if (this.cpu === p && !this.stopping) this.fatal(Error('CPU worker exited')); });
        const base = which === 'cpu' ? this.config.cpuUrl : this.config.gpuUrl;
        for (let i = 0; i < 120; i++) {
            if (!alive(p)) throw Error('Worker startup exit');
            try { const r = await fetch(base + '/health', { signal: AbortSignal.timeout(1000) }); if (r.ok) return; } catch {}
            await Bun.sleep(500);
        }
        throw Error('Worker startup timeout');
    }
    async stopGpu() {
        if (this.gpuStop) return this.gpuStop;
        const p = this.gpu; if (!p) return;
        this.gpuStop = (async () => {
            if (alive(p)) p.kill('SIGTERM');
            await Promise.race([p.exited, Bun.sleep(8000)]);
            if (alive(p)) { p.kill('SIGKILL'); await p.exited; }
            if (this.gpu === p) this.gpu = undefined;
        })();
        try { await this.gpuStop; } finally { this.gpuStop = undefined; }
    }
    async stop() {
        this.stopping = true; await this.stopGpu();
        if (alive(this.cpu)) { this.cpu.kill('SIGTERM'); await Promise.race([this.cpu.exited, Bun.sleep(8000)]); if (alive(this.cpu)) this.cpu.kill('SIGKILL'); }
    }
    fetch(path: string, init: RequestInit = {}) {
        if (!alive(this.cpu)) throw Error('CPU worker unavailable');
        return fetch(this.config.cpuUrl + path, { ...init, timeout: false } as any);
    }
    async api(base: string, path: string, body?: any, signal?: AbortSignal) {
        const r = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: signal ?? AbortSignal.timeout(10000), timeout: false });
        if (!r.ok) { await r.body?.cancel(); throw Error('Native API ' + r.status); }
        return r.json();
    }
    async idle(signal?: AbortSignal) {
        for (let i = 0; i < 80; i++) {
            if (signal?.aborted) throw Error('Cancelled while draining');
            const slots = await this.api(this.config.cpuUrl, '/slots');
            if (!Array.isArray(slots) || slots.length !== 2) throw Error('Unexpected CPU slot geometry');
            if (slots.every(s => s.is_processing === false)) return;
            await Bun.sleep(250);
        }
        throw Error('CPU did not drain');
    }
    async erase(slot: number) { await this.api(this.config.cpuUrl, `/slots/${slot}?action=erase`, {}); }
    async gpuGuard(beforeStart = false) {
        await checkSpeechJobs(this.config.speechMode ?? 'active');
        const current = new Map<number, number>();
        for (const pid of readdirSync('/proc').filter(p => /^\d+$/.test(p))) {
            const comm = text(`/proc/${pid}/comm`).trim();
            if (comm === 'whisper-cli') throw Error('Speech CLI active');
            if (comm === 'diar-server') {
                const stat = text(`/proc/${pid}/stat`).replace(/^.*\) /, '').split(' '), ticks = Number(stat[11]) + Number(stat[12]);
                if (!Number.isFinite(ticks)) throw Error('Native speech guard unavailable');
                if (this.native.has(+pid) && ticks - this.native.get(+pid)! > 10) throw Error('Native speech activity');
                current.set(+pid, ticks);
            }
        }
        this.native = current;
        const p = Bun.spawn(['ss', '-tn', 'state', 'established', '( sport = :8092 or sport = :8701 )'], { stdout: 'pipe', stderr: 'ignore' });
        const sockets = await new Response(p.stdout).text();
        if (await p.exited || sockets.split('\n').slice(1).some(l => Number(l.trim().split(/\s+/)[0]) > 0)) throw Error('Speech receive queue active or unavailable');
        // Startup headroom includes GPU weights/workspace; continuous reserve is the measured6GiB floor.
        if (num(text('/proc/meminfo'), 'MemAvailable') < (beforeStart ? 12 : 6) * 1048576) throw Error('GPU memory reserve');
        for (const worker of [this.cpu, this.gpu].filter(Boolean)) {
            const status = text(`/proc/${worker.pid}/status`);
            if (!status || num(status, 'VmSwap') > 16384) throw Error('Native worker gone or swapping');
        }
    }
    async accelerate(tokens: number[], slot: number, signal: AbortSignal) {
        const cancel = new AbortController();
        const combined = AbortSignal.any([signal, cancel.signal, AbortSignal.timeout(20 * 60 * 1000)]);
        const files = [`transfer-${++this.seq}.slot`, `transfer-${this.seq}-v2.slot`];
        let timer: any, checking = false, guardFailure = false, phase = 'admission';
        try {
            await this.gpuGuard(true); await Bun.sleep(1100); await this.gpuGuard(true);
            if (combined.aborted) throw Error('Cancelled before GPU startup');
            timer = setInterval(async () => {
                if (checking) return; checking = true;
                try { await this.gpuGuard(); }
                catch { guardFailure = true; cancel.abort(); await this.stopGpu(); }
                finally { checking = false; }
            }, 750);
            phase = 'startup'; await this.start('gpu');
            if (guardFailure || combined.aborted) throw Error('GPU admission cancelled');
            phase = 'prefill'; await this.api(this.config.gpuUrl, '/completion', { prompt: tokens, n_predict: 1, temperature: 0, cache_prompt: false, id_slot: 0 }, combined);
            phase = 'save'; await this.api(this.config.gpuUrl, '/slots/0?action=save', { filename: files[0] }, combined);
            if (combined.aborted) throw Error('Cancelled before transfer');
            phase = 'convert'; const conversion = convertGemmaV3ToV2(this.config.stateDir + '/' + files[0], this.config.stateDir + '/' + files[1]);
            convertedTokenCount(conversion, tokens.length);
            if (combined.aborted) throw Error('Cancelled before restore');
            phase = 'restore'; await this.api(this.config.cpuUrl, `/slots/${slot}?action=restore`, { filename: files[1] }, combined);
        } catch (e) {
            // Exceptions here contain local guard/schema errors, never request bodies or model output.
            console.error('GPU acceleration failed at ' + phase + ': ' + (e instanceof Error ? e.message : 'unknown'));
            throw e;
        } finally {
            clearInterval(timer); while (checking) await Bun.sleep(25);
            await this.stopGpu();
            for (const name of [...files, files[1] + '.tmp']) { try { unlinkSync(this.config.stateDir + '/' + name); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
        }
        if (guardFailure || combined.aborted) throw Error('Acceleration interrupted');
    }
}
