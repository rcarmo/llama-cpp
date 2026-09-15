#!/usr/bin/env bun

// SCRIPT_JDOC: {"summary":"Verify live incremental SSE, prompt progress and zero-copy telemetry from the Gemma service.","aliases":["verify Gemma streaming","test Gemma progress"],"domains":["llama.cpp","Gemma","HTTP"],"verbs":["verify","test"],"nouns":["SSE","streaming","progress"],"kind":"read-only","weight":"standard","role":"entrypoint"}

const base = process.env.GEMMA_ZERO_COPY_URL ?? 'http://127.0.0.1:18094';
const started = performance.now();
const response = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'X-Conversation-Id': 'verify-live-stream'},
    body: JSON.stringify({
        model: 'gemma-4-e4b-qat-mtp-zero-copy',
        messages: [{role: 'user', content: 'Write eight concise numbered recommendations for reducing local language model latency.'}],
        temperature: 0,
        seed: 42,
        max_tokens: 128,
        stream: true,
    }),
});
if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
const events: Array<{ms: number; data: any}> = [];
let pending = '';
for await (const bytes of response.body) {
    pending += new TextDecoder().decode(bytes);
    let end;
    while ((end = pending.indexOf('\n\n')) >= 0) {
        const event = pending.slice(0, end);
        pending = pending.slice(end + 2);
        const line = event.split('\n').find(value => value.startsWith('data: '));
        if (!line || line === 'data: [DONE]') continue;
        events.push({ms: performance.now() - started, data: JSON.parse(line.slice(6))});
    }
}
const progress = events.filter(event => event.data.prompt_progress);
const content = events.filter(event => typeof event.data.choices?.[0]?.delta?.content === 'string' && event.data.choices[0].delta.content.length > 0);
const final = events.findLast(event => event.data.choices?.[0]?.finish_reason);
if (progress.length < 1) throw new Error('no prompt progress events');
if (content.length < 2) throw new Error(`only ${content.length} content events`);
if (!final?.data.zero_copy?.zero_copy || final.data.zero_copy.copied_bytes !== 0) throw new Error('invalid final zero-copy event');
if (content[0].ms >= final.ms) throw new Error('content was not incremental');
console.log(JSON.stringify({
    passed: true,
    event_count: events.length,
    progress_count: progress.length,
    content_count: content.length,
    first_event_ms: events[0]?.ms,
    first_progress_ms: progress[0]?.ms,
    first_content_ms: content[0]?.ms,
    final_ms: final.ms,
    progress: progress.map(event => ({ms: event.ms, value: event.data.prompt_progress})),
    text: content.map(event => event.data.choices[0].delta.content).join(''),
    finish_reason: final.data.choices[0].finish_reason,
    usage: final.data.usage,
    zero_copy: final.data.zero_copy,
}, null, 2));
