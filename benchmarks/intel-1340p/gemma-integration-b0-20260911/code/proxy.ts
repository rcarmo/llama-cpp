/** SCRIPT_JDOC:
{"summary":"Serve bounded GPU cold-prefill and CPU-owned streaming chat through the original API","kind":"mixed","weight":"standard","role":"module"}
*/
import { boundedBody, eligibleTextChat, gpuEligible, HttpError, Owners, SerialGate } from './policy';
import { SseTiming } from './stream';
export interface Backend {
    fetch(path: string, init?: RequestInit): Promise<Response>;
    idle(signal?: AbortSignal): Promise<void>;
    erase(slot: number): Promise<void>;
    accelerate(tokens: number[], slot: number, signal: AbortSignal): Promise<void>;
    stopGpu(): Promise<void>;
    fatal(error: unknown): void;
}
const READ_POST = new Set(['/tokenize', '/detokenize', '/apply-template']);
const INFERENCE = new Set(['/completion', '/completions', '/v1/completions', '/chat/completions', '/v1/chat/completions', '/embeddings', '/v1/embeddings', '/rerank', '/v1/rerank', '/infill']);
const HEADERS = ['content-type', 'cache-control', 'content-encoding', 'etag', 'last-modified'];
function headers(input: Headers) { return new Headers(HEADERS.flatMap(k => input.has(k) ? [[k, input.get(k)!]] : [])); }
export class HybridProxy {
    gate = new SerialGate(8);
    owners = new Owners();
    last: any = null;
    counts = { gpu: 0, warm: 0, cpu: 0, fallback: 0, errors: 0 };
    constructor(public backend: Backend, public minGpu = 4096, public maxGpu = 65536) {}
    async json(path: string, body: any, signal?: AbortSignal) {
        const r = await this.backend.fetch(path, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' }, signal });
        if (!r.ok) { await r.body?.cancel(); throw new HttpError(r.status, 'Native request rejected at ' + path); }
        return r.json();
    }
    async handle(request: Request): Promise<Response> {
        const url = new URL(request.url), path = url.pathname;
        if (request.method === 'GET' && path === '/hybrid/status') return Response.json({ profile: 'vulkan-f32-256/cpu8-mtp3', serial: true, gpuRange: [this.minGpu, this.maxGpu], active: this.gate.active, queued: this.gate.waiting.length, counters: this.counts, last: this.last });
        // Native configuration and slot-file mutation must not bypass the owner queue.
        if (request.method !== 'GET' && request.method !== 'HEAD' && !(request.method === 'POST' && (INFERENCE.has(path) || READ_POST.has(path)))) return Response.json({ error: { message: 'Unsupported adapter route', type: 'invalid_request_error' } }, { status: 404 });
        if (request.method === 'GET' || request.method === 'HEAD') {
            if (url.searchParams.has('action')) return new Response('Slot mutation is private', { status: 403 });
            try { const r = await this.backend.fetch(path + url.search, { method: request.method, signal: request.signal }); return new Response(r.body, { status: r.status, headers: headers(r.headers) }); }
            catch { return Response.json({ error: 'CPU backend unavailable' }, { status: 503 }); }
        }
        const abort = new AbortController();
        let responseReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
        let abortCleanup: (() => Promise<void>) | undefined;
        const onAbort = () => {
            abort.abort(request.signal.reason);
            if (responseReader) void responseReader.cancel().catch(() => {}).finally(() => abortCleanup?.());
        };
        request.signal.addEventListener('abort', onAbort, { once: true });
        if (request.signal.aborted) onAbort();
        let release: (() => void) | undefined, slot: number | undefined, tokens: number[] | undefined;
        let gpu = false, route = 'cpu', inference = INFERENCE.has(path), dispatched = false, finished = false;
        const start = performance.now();
        const cleanup = async (success: boolean) => {
            if (finished) return; finished = true;
            try {
                if (inference && dispatched) {
                    await this.backend.idle();
                    if (slot !== undefined) {
                        if (success && tokens) this.owners.commit(slot, tokens);
                        else { this.owners.clear(slot); await this.backend.erase(slot); }
                    }
                }
            } catch (e) { this.owners.clear(); this.backend.fatal(e); }
            finally { request.signal.removeEventListener('abort', onAbort); release?.(); }
        };
        try {
            release = await this.gate.acquire(abort.signal);
            const bytes = await boundedBody(request);
            let body: any; try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new HttpError(400, 'Invalid JSON'); }
            if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'JSON object required');
            if (abort.signal.aborted) throw new HttpError(499, 'Request cancelled');
            if (inference) { await this.backend.idle(abort.signal); dispatched = true; }
            const chat = path === '/v1/chat/completions' || path === '/chat/completions';
            if (chat && eligibleTextChat(body)) {
                const rendered = await this.json('/apply-template', body, abort.signal);
                const value = await this.json('/tokenize', { content: rendered.prompt, add_special: true, parse_special: true }, abort.signal);
                tokens = value.tokens;
                if (!Array.isArray(tokens) || tokens.length > 131072 || !tokens.every(n => Number.isInteger(n) && n >= 0)) throw new HttpError(400, 'Invalid or oversized tokenised prompt');
                const choice = this.owners.choose(tokens, body.id_slot); slot = choice.slot;
                route = choice.warm ? 'cpu-owner' : 'cpu';
                if (gpuEligible(body, tokens, choice.warm, this.owners, this.minGpu, this.maxGpu)) {
                    try {
                        await this.backend.accelerate(tokens.slice(0, -1), slot, abort.signal);
                        gpu = true; route = 'gpu-cold';
                    } catch (e) {
                        await this.backend.stopGpu();
                        await this.backend.idle(); await this.backend.erase(slot); this.owners.clear(slot);
                        if (abort.signal.aborted) throw new HttpError(499, 'Cancelled before decode');
                        this.counts.fallback++; route = 'cpu-fallback';
                        // No CPU generation or client response has started, so fallback cannot duplicate output.
                    }
                }
                body = { ...body, id_slot: slot, cache_prompt: true };
            } else if (inference) { this.owners.clear(); }
            if (abort.signal.aborted) throw new HttpError(499, 'Cancelled before native request');
            const upstream = await this.backend.fetch(path + url.search, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: abort.signal });
            if (!upstream.ok) {
                const message = await upstream.text(); await cleanup(false);
                return new Response(message, { status: upstream.status, headers: headers(upstream.headers) });
            }
            if (inference) {
                if (gpu) this.counts.gpu++; else if (route === 'cpu-owner') this.counts.warm++; else this.counts.cpu++;
                this.last = { route, slot, prompt_tokens: tokens?.length, headers_ms: performance.now() - start };
            }
            const h = headers(upstream.headers); h.set('x-hybrid-route', route);
            if (!upstream.body) { await cleanup(true); return new Response(null, { status: upstream.status, headers: h }); }
            if (!body.stream) {
                const data = await upstream.arrayBuffer();
                if (gpu) {
                    const result = JSON.parse(new TextDecoder().decode(data));
                    if ((result.timings?.cache_n ?? -1) < tokens!.length - 2 || (result.timings?.prompt_n ?? Infinity) > 2) throw new Error('Native handoff coverage mismatch');
                }
                await cleanup(true); return new Response(data, { status: upstream.status, headers: h });
            }
            // Keep admission until the native byte stream reaches EOF or cancellation drains the slot.
            const reader = upstream.body.getReader();
            responseReader = reader; abortCleanup = () => cleanup(false);
            const timing = new SseTiming(tokens?.length ?? 0, gpu, path === '/completion');
            const stream = new ReadableStream<Uint8Array>({
                pull: async controller => {
                    try {
                        const { value, done } = await reader.read();
                        if (done) { timing.finish(); await cleanup(true); controller.close(); }
                        else { timing.feed(value); controller.enqueue(value); }
                    } catch (e) { abort.abort(); await reader.cancel().catch(() => {}); await cleanup(false); controller.error(e); }
                },
                cancel: async () => { abort.abort(); await reader.cancel().catch(() => {}); await cleanup(false); },
            });
            return new Response(stream, { status: upstream.status, headers: h });
        } catch (e) {
            this.counts.errors++; abort.abort(); await cleanup(false);
            return Response.json({ error: { message: e instanceof HttpError ? e.message : 'Hybrid request failed; retry with full conversation', type: 'server_error' } }, { status: e instanceof HttpError ? e.status : 502 });
        }
    }
}
