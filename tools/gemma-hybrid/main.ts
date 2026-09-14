/** SCRIPT_JDOC:
{"summary":"Run the opt-in Gemma hybrid API supervisor; requires pinned configuration and exclusive native ports","kind":"mutating","weight":"heavy","role":"entrypoint"}
*/
import { readFileSync, openSync, closeSync, writeFileSync } from 'node:fs';
import { Workers, type Config } from './workers';
import { HybridProxy } from './proxy';
const config: Config = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (config.host !== '127.0.0.1' || !Number.isInteger(config.port) || config.port < 1024) throw Error('Loopback-only adapter');
for (const url of [config.cpuUrl, config.gpuUrl]) if (!/^http:\/\/127\.0\.0\.1:[0-9]+$/.test(url)) throw Error('Loopback-only native workers');
for (const profile of [config.cpu, config.gpu]) {
    if (!profile.argv?.length || Object.keys(profile.hashes ?? {}).length < 3) throw Error('Pinned runtime manifest required');
    if (profile.argv[profile.argv.indexOf('--host') + 1] !== '127.0.0.1') throw Error('Native worker exposure');
}
// OS flock survives abrupt exit without a stale lockfile; childworkers do not inherit this descriptor.
const lock = openSync(config.stateDir + '.lock', 'a', 0o600);
const locked = Bun.spawnSync(['flock', '--exclusive', '--nonblock', '3'], { stdio: ['ignore', 'ignore', 'inherit', lock] } as any);
if (locked.exitCode !== 0) { closeSync(lock); throw Error('Another hybrid controller owns this workdirectory'); }
let server: ReturnType<typeof Bun.serve> | undefined, closing = false;
const shutdown = async (code: number) => {
    if (closing) return; closing = true;
    server?.stop(true); await workers.stop(); closeSync(lock); process.exit(code);
};
const workers = new Workers(config, () => { console.error('Native CPU generation invalidated; restarting supervisor'); void shutdown(1); });
process.on('SIGTERM', () => void shutdown(0)); process.on('SIGINT', () => void shutdown(0));
process.on('uncaughtException', () => void shutdown(1)); process.on('unhandledRejection', () => void shutdown(1));
try {
    await workers.start('cpu'); await workers.idle();
    const proxy = new HybridProxy(workers, config.minGpu ?? 4096, config.maxGpu ?? 65536);
    server = Bun.serve({ hostname: config.host, port: config.port, idleTimeout: 0, maxRequestBodySize: 2 * 1024 * 1024, fetch: request => proxy.handle(request) });
    writeFileSync(config.stateDir + '/supervisor.json', JSON.stringify({ pid: process.pid, cpu_pid: workers.cpu.pid, port: config.port, started_at: new Date().toISOString() }) + '\n', { mode: 0o600 });
    console.log('Gemma hybrid API ready on loopback:' + config.port);
} catch { await shutdown(1); }
