// Fixed-work throughput samples. Start the selected server before running.
const base = process.env.BASE_URL || 'http://127.0.0.1:19450';
const out = process.argv[2];
if (!out) throw Error('Usage: bun gsq-throughput.ts OUTPUT.json');
const records = [];
for (const [phase, prompt, n_predict] of [
    ['prefill', 'Summarize the following records.\n' + 'The storage system keeps immutable records and validates each checksum before reading.\n'.repeat(400), 1],
    ['decode', 'Write a detailed technical guide to memory ownership and compiler optimization.', 256],
] as const) {
    for (let run = 0; run < 4; run++) {
        const start = performance.now();
        const response = await fetch(base + '/completion', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({prompt, n_predict, ignore_eos: true, cache_prompt: false, temperature: 0, top_k: 1, seed: 42}),
            signal: AbortSignal.timeout(180000),
        });
        const data = await response.json() as any;
        if (!response.ok || data.tokens_predicted !== n_predict) throw Error(JSON.stringify(data));
        records.push({phase, run, warmup: run === 0, wallMs: performance.now() - start, timings: data.timings, content: data.content});
    }
}
await Bun.write(out, JSON.stringify({base,records}, null, 2));
console.log(JSON.stringify(records.map(({content, ...record}) => record), null, 2));
