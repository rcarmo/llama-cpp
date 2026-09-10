import { test, expect } from 'bun:test';
import { SseTiming, processAlive, convertedTokenCount } from './stream';
const bytes = (s: string) => new TextEncoder().encode(s);
test('chunked SSE validates native handoff timings and completion', () => {
    const s = new SseTiming(5000, true);
    s.feed(bytes('data: {"ti')); s.feed(bytes('mings":{"cache_n":4999,"prompt_n":1}}\n\ndata: [DONE]\n\n'));
    s.finish(); expect(s.timings.cache_n).toBe(4999);
});
test('SSE mismatch and missing completion rejected', () => {
    expect(() => new SseTiming(5000, true).feed(bytes('data: {"timings":{"cache_n":0,"prompt_n":5000}}\n'))).toThrow('coverage');
    expect(() => new SseTiming(5000, false).finish()).toThrow('Incomplete');
    const s = new SseTiming(5000, true); s.feed(bytes('data: [DONE]\n\n')); expect(() => s.finish()).toThrow('timing missing');
});
test('native completion terminates with stop=true instead of OpenAI DONE', () => {
    const s = new SseTiming(0, false, true); s.feed(bytes('data: {"content":"OK","stop":true}\n\n')); expect(() => s.finish()).not.toThrow();
    const chat = new SseTiming(0, false); chat.feed(bytes('data: {"stop":true}\n\n')); expect(() => chat.finish()).toThrow('Incomplete');
});
test('native signal termination is not a live process', () => {
    expect(processAlive({ exitCode: null, signalCode: null })).toBe(true);
    expect(processAlive({ exitCode: null, signalCode: 'SIGKILL' })).toBe(false);
    expect(processAlive({ exitCode: 0, signalCode: null })).toBe(false);
});
test('converter uses the validated parsed token count', () => {
    expect(() => convertedTokenCount({ parsed: { tokens: 4999 } }, 4999)).not.toThrow();
    expect(() => convertedTokenCount({ tokens: 4999 }, 4999)).toThrow('coverage');
});
