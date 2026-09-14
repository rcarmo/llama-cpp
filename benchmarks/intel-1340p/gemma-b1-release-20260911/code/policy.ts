/** SCRIPT_JDOC:
{"summary":"Bound admission and token-prefix slot ownership for the Gemma hybrid adapter","kind":"read-only","weight":"lightweight","role":"module"}
*/
export class HttpError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
export class SerialGate {
    active = false;
    waiting: Array<{ resolve: (release: () => void) => void; reject: (error: Error) => void; signal?: AbortSignal; abort: () => void }> = [];
    constructor(public capacity = 8) {}
    acquire(signal?: AbortSignal): Promise<() => void> {
        if (signal?.aborted) return Promise.reject(new HttpError(499, 'Request cancelled'));
        if (Number(this.active) + this.waiting.length >= this.capacity) return Promise.reject(new HttpError(429, 'Inference queue full'));
        if (!this.active) { this.active = true; return Promise.resolve(this.releaseOnce()); }
        return new Promise((resolve, reject) => {
            const item = { resolve, reject, signal, abort: () => {
                const index = this.waiting.indexOf(item);
                if (index >= 0) this.waiting.splice(index, 1);
                reject(new HttpError(499, 'Request cancelled in queue'));
            } };
            this.waiting.push(item); signal?.addEventListener('abort', item.abort, { once: true });
        });
    }
    private releaseOnce() {
        let done = false;
        return () => {
            if (done) return; done = true;
            const next = this.waiting.shift();
            if (next) { next.signal?.removeEventListener('abort', next.abort); next.resolve(this.releaseOnce()); }
            else this.active = false;
        };
    }
}
export function commonPrefix(a: number[], b: number[]) {
    let n = 0; while (n < Math.min(a.length, b.length) && a[n] === b[n]) n++; return n;
}
export class Owners {
    entries = new Map<number, { tokens: number[]; used: number }>();
    clock = 0;
    choose(tokens: number[], requested?: number) {
        if (requested !== undefined && requested !== -1 && requested !== 0 && requested !== 1) throw new HttpError(400, 'Invalid id_slot');
        const matches = [...this.entries].map(([slot, value]) => ({ slot, prefix: commonPrefix(tokens, value.tokens), value }))
            .filter(x => requested === undefined || requested === -1 || requested === x.slot).sort((a, b) => b.prefix - a.prefix);
        const best = matches[0];
        if (best && best.prefix >= Math.max(128, best.value.tokens.length - 16)) return { slot: best.slot, warm: true, prefix: best.prefix };
        const slot = requested !== undefined && requested !== -1 ? requested : [0, 1].find(n => !this.entries.has(n)) ?? [...this.entries].sort((a, b) => a[1].used - b[1].used)[0][0];
        return { slot, warm: false, prefix: 0 };
    }
    commit(slot: number, tokens: number[]) { this.entries.set(slot, { tokens: tokens.slice(), used: ++this.clock }); }
    clear(slot?: number) { if (slot === undefined) this.entries.clear(); else this.entries.delete(slot); }
    gpuCapacitySafe() { return [...this.entries.values()].every(x => x.tokens.length <= 65536); }
}
export function eligibleTextChat(body: any) {
    if (!body || !Array.isArray(body.messages) || !body.messages.length || body.cache_prompt === false || (body.n !== undefined && body.n !== 1)) return false;
    if (['prompt', 'input_prefix', 'input_suffix', 'chat_template', 'image_data', 'logit_bias', 'samplers', 'lora', 'ignore_eos', 'continue_final_message'].some(k => k in body)) return false;
    return body.messages.every(m => typeof m?.role === 'string' && (m.content === null || m.content === undefined || typeof m.content === 'string') && !m.audio && !m.images);
}
export function gpuEligible(body: any, tokens: number[], warm: boolean, owners: Owners, min = 4096, max = 65536) {
    return eligibleTextChat(body) && !warm && tokens.length >= min && tokens.length <= max && owners.gpuCapacitySafe();
}
export async function boundedBody(request: Request, max = 2 * 1024 * 1024) {
    const declared = Number(request.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > max) throw new HttpError(413, 'Request too large');
    const reader = request.body?.getReader();
    if (!reader) return new Uint8Array();
    const chunks: Uint8Array[] = []; let size = 0;
    try {
        while (true) {
            const { value, done } = await reader.read(); if (done) break;
            size += value.length; if (size > max) throw new HttpError(413, 'Request too large'); chunks.push(value);
        }
    } catch (e) { await reader.cancel().catch(() => {}); throw e; }
    finally { reader.releaseLock(); }
    const result = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
    return result;
}
