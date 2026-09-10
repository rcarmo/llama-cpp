/** SCRIPT_JDOC:
{"summary":"Inspect bounded native SSE timing metadata without changing forwarded tool/content bytes","kind":"read-only","weight":"lightweight","role":"module"}
*/
export class SseTiming {
    private decoder = new TextDecoder();
    private pending = '';
    timings: any;
    done = false;
    constructor(private promptTokens: number, private requireHandoff: boolean, private nativeCompletion = false) {}
    feed(value: Uint8Array) {
        this.pending += this.decoder.decode(value, { stream: true });
        if (this.pending.length > 2 * 1024 * 1024) throw Error('Native SSE record exceeds bound');
        for (;;) {
            const end = this.pending.indexOf('\n'); if (end < 0) break;
            const line = this.pending.slice(0, end).trimEnd(); this.pending = this.pending.slice(end + 1);
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (data === '[DONE]') { this.done = true; continue; }
            if (!data) continue;
            const result = JSON.parse(data);
            if (result.error) throw Error('Native stream reported an error');
            if (this.nativeCompletion && result.stop === true) this.done = true;
            if (result.timings) {
                this.timings = result.timings;
                if (this.requireHandoff && ((this.timings.cache_n ?? -1) < this.promptTokens - 2 || (this.timings.prompt_n ?? Infinity) > 2)) throw Error('Native streamed handoff coverage mismatch');
            }
        }
    }
    finish() {
        if (!this.done || this.pending.trim()) throw Error('Incomplete native SSE');
        if (this.requireHandoff && !this.timings) throw Error('Native streamed handoff timing missing');
    }
}
export const processAlive = (p: any) => Boolean(p && p.exitCode === null && p.signalCode === null);
export function convertedTokenCount(conversion: any, expected: number) {
    if (conversion?.parsed?.tokens !== expected) throw Error('Transfer token coverage');
}
