import { describe, test, expect } from 'bun:test';
import { HybridProxy, type Backend } from './proxy';
import { Owners, SerialGate, boundedBody } from './policy';
class Fake implements Backend {
    n = 5000; calls: any[] = []; failGpu = false; fatalErrors: any[] = []; held?: ReadableStreamDefaultController<Uint8Array>;
    async fetch(path: string, init?: RequestInit) {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        this.calls.push({ path, body });
        if (path === '/apply-template') return Response.json({ prompt: body.messages[0].content });
        if (path === '/tokenize') return Response.json({ tokens: Array.from({ length: this.n }, (_, i) => i + (body.content?.startsWith('other') ? 1 : 0)) });
        if (body.stream) return new Response(new ReadableStream({ start: c => { this.held = c; c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0}]}}]}\n\n')); } }), { headers: { 'content-type': 'text/event-stream' } });
        return Response.json({ choices: [{ message: { content: '23' } }], timings: { cache_n: this.n - 1, prompt_n: 1 } });
    }
    async idle() { this.calls.push({ idle: true }); }
    async erase(slot: number) { this.calls.push({ erase: slot }); }
    async accelerate(tokens: number[], slot: number, signal: AbortSignal) { this.calls.push({ accelerate: tokens.length, slot }); if (this.failGpu) throw Error('GPU gone'); }
    async stopGpu() { this.calls.push({ stop: true }); }
    fatal(error: unknown) { this.fatalErrors.push(error); }
}
const request = (body: any = {}, signal?: AbortSignal) => new Request('http://localhost/v1/chat/completions', { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'test' }], ...body }), signal });
test('cold text prefill excludes final token; warm continuation stays CPU', async () => {
    const b = new Fake(), p = new HybridProxy(b);
    const r = await p.handle(request()); expect(r.headers.get('x-hybrid-route')).toBe('gpu-cold'); expect(r.status).toBe(200);
    expect(b.calls.find(c => c.accelerate)).toMatchObject({ accelerate: 4999, slot: 0 });
    b.n = 5030; const warm = await p.handle(request()); expect(warm.headers.get('x-hybrid-route')).toBe('cpu-owner'); expect(b.calls.filter(c => c.accelerate)).toHaveLength(1);
});
test('GPU failure before decode cleans slot and uses CPU without duplicate output', async () => {
    const b = new Fake(); b.failGpu = true; const p = new HybridProxy(b), r = await p.handle(request());
    expect(r.headers.get('x-hybrid-route')).toBe('cpu-fallback'); expect((await r.json()).choices[0].message.content).toBe('23');
    expect(b.calls.filter(c => c.path === '/v1/chat/completions')).toHaveLength(1); expect(b.calls.some(c => c.erase === 0)).toBe(true);
});
test('above64K and multimodal prompts bypass GPU', async () => {
    const b = new Fake(), p = new HybridProxy(b); b.n = 70000;
    expect((await p.handle(request())).headers.get('x-hybrid-route')).toBe('cpu');
    await p.handle(request({ messages: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }] }));
    expect(b.calls.filter(c => c.accelerate)).toHaveLength(0);
});
test('SSE bytes are forwarded and gate remains held until stream finishes', async () => {
    const b = new Fake(), p = new HybridProxy(b), r = await p.handle(request({ stream: true }));
    expect(p.gate.active).toBe(true);
    const reader = r.body!.getReader(), first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain('tool_calls');
    const abort = new AbortController(); const waiting = p.handle(request({}, abort.signal)); await Bun.sleep(2); abort.abort();
    expect((await waiting).status).toBe(499); expect(p.gate.active).toBe(true);
    b.held!.enqueue(new TextEncoder().encode('data: {"timings":{"cache_n":4999,"prompt_n":1}}\n\ndata: [DONE]\n\n')); b.held!.close();
    while (!(await reader.read()).done) {} expect(p.gate.active).toBe(false); expect(p.owners.entries.size).toBe(1);
});
test('request disconnect cancels unconsumed upstream stream', async () => {
    const b = new Fake(), p = new HybridProxy(b), abort = new AbortController();
    await p.handle(request({ stream: true }, abort.signal)); abort.abort(); await Bun.sleep(5);
    expect(p.gate.active).toBe(false); expect(p.owners.entries.size).toBe(0);
});
test('cancelled stream invalidates its slot and releases after drain', async () => {
    const b = new Fake(), p = new HybridProxy(b), r = await p.handle(request({ stream: true }));
    await r.body!.cancel(); expect(p.gate.active).toBe(false); expect(p.owners.entries.size).toBe(0); expect(b.calls.some(c => c.erase === 0)).toBe(true);
});
test('mutating slot and configuration routes are not forwarded', async () => {
    const b = new Fake(), p = new HybridProxy(b);
    expect((await p.handle(new Request('http://local/slots/0?action=restore', { method: 'POST', body: '{}' }))).status).toBe(404);
    expect((await p.handle(new Request('http://local/slots/0?action=erase'))).status).toBe(403); expect(b.calls.length).toBe(0);
});
test('two prefix owners stay independent and evict least recent', () => {
    const p = new Owners(), a = Array(200).fill(1), b = Array(200).fill(2), c = Array(200).fill(3);
    p.commit(0, a); p.commit(1, b); expect(p.choose([...a, 9]).slot).toBe(0); p.commit(0, [...a, 9]);
    expect(p.choose(c)).toMatchObject({ slot: 1, warm: false }); expect(p.choose(a, 1).warm).toBe(false);
});
test('queue bounded and cancelled waiter does not release active owner', async () => {
    const gate = new SerialGate(2), release = await gate.acquire(), abort = new AbortController();
    const queued = gate.acquire(abort.signal); expect(gate.acquire()).rejects.toThrow('full'); abort.abort(); await expect(queued).rejects.toThrow('cancelled');
    expect(gate.active).toBe(true); release(); release(); expect(gate.active).toBe(false);
});
test('oversized body rejected without GPU work', async () => {
    const b = new Fake(), p = new HybridProxy(b);
    const r = await p.handle(request({ messages: [{ role: 'user', content: 'x'.repeat(2 * 1024 * 1024) }] }));
    expect(r.status).toBe(413); expect(b.calls.length).toBe(0); expect(p.gate.active).toBe(false);
});
