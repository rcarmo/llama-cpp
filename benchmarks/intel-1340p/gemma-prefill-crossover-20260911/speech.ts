/** SCRIPT_JDOC:
{"summary":"Check active speech jobs or explicitly stopped speech units without treating network failure as idle","kind":"read-only","weight":"lightweight","role":"module"}
*/
import { readdirSync, readFileSync } from 'node:fs';
export type SpeechMode = 'active' | 'stopped';
const units = ['whisper-stt.service', 'whisper-stt-diarizer.service'];
async function command(argv: string[]) {
    const p = Bun.spawn(argv, { stdout: 'pipe', stderr: 'ignore', env: { ...process.env, XDG_RUNTIME_DIR: '/run/user/1001', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1001/bus' } });
    const timer = setTimeout(() => p.kill('SIGKILL'), 2500);
    try {
        const [out, rc] = await Promise.all([new Response(p.stdout).text(), p.exited]);
        if (rc !== 0) throw Error('Speech status command failed');
        return out;
    } finally { clearTimeout(timer); }
}
const io = {
    command,
    jobs: async () => {
        const r = await fetch('http://127.0.0.1:8092/api/jobs', { signal: AbortSignal.timeout(2500) });
        if (!r.ok) throw Error('Speech guard unavailable');
        return r.json();
    },
    native: () => readdirSync('/proc').filter(p => /^\d+$/.test(p)).flatMap(p => {
        try { return [readFileSync(`/proc/${p}/comm`, 'utf8').trim()]; }
        catch (e) { if (e.code === 'ENOENT' || e.code === 'ESRCH') return []; throw e; }
    }),
};
export async function checkSpeechJobs(mode: SpeechMode = 'active', deps = io) {
    if (mode === 'active') {
        const jobs = await deps.jobs();
        if (!Array.isArray(jobs) || jobs.some(j => !['completed', 'failed', 'cancelled'].includes(j?.state))) throw Error('Speech work active or unknown');
        return;
    }
    if (mode !== 'stopped') throw Error('Unknown speech mode');
    const raw = await deps.command(['systemctl', '--user', 'show', ...units, '-p', 'Id', '-p', 'LoadState', '-p', 'ActiveState', '-p', 'SubState', '-p', 'MainPID']);
    const rows = raw.trim().split(/\n\s*\n/).map(block => Object.fromEntries(block.split('\n').map(line => { const i=line.indexOf('='); return [line.slice(0,i),line.slice(i+1)]; })));
    if (rows.length !== 2 || units.some(unit => !rows.some(r => r.Id === unit && r.LoadState === 'loaded' && r.ActiveState === 'inactive' && r.SubState === 'dead' && r.MainPID === '0'))) throw Error('Speech units not explicitly stopped');
    for (const args of [['-Hltn'], ['-Htn', 'state', 'established']]) {
        const out = await deps.command(['ss', ...args, '( sport = :8092 or sport = :8701 )']);
        if (out.trim()) throw Error('Stopped speech has sockets');
    }
    if (deps.native().some(name => name === 'diar-server' || name === 'whisper-cli')) throw Error('Stopped speech has native workers');
}
if (import.meta.main) { await checkSpeechJobs(process.argv[2] as SpeechMode); console.log('PASS speech state'); }
