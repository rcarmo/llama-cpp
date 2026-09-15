#!/usr/bin/env bun

const base = process.env.GEMMA_ZERO_COPY_URL ?? 'http://127.0.0.1:18094';
const tokens = Number(process.argv[2] ?? 4096);
const label = process.argv[3] ?? `long-${tokens}`;
const filler = ' x'.repeat(Math.max(1, tokens - 32));
const body = {
    model: 'gemma-4-e4b-qat-mtp-zero-copy',
    messages: [{role: 'user', content: `Read this data, then reply with exactly LONG OK.\n${filler}\nEnd of data.`}],
    temperature: 0,
    max_tokens: 24,
    stream: false,
};
const started = performance.now();
const response = await fetch(`${base}/v1/chat/completions`, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Conversation-Id': label}, body: JSON.stringify(body)});
const data = await response.json() as any;
if (!response.ok) throw new Error(JSON.stringify(data));
const content = String(data.choices?.[0]?.message?.content ?? '');
if (!content.includes('LONG OK')) throw new Error(`unexpected content: ${content}`);
if (!data.zero_copy?.zero_copy || data.zero_copy.shared_bytes <= 0 || data.zero_copy.copied_bytes !== 0) throw new Error('zero-copy telemetry failed');
await fetch(`${base}/v1/stream`, {method: 'DELETE', headers: {'X-Conversation-Id': label}});
const actual = data.zero_copy.prompt_tokens;
if (Math.abs(actual - tokens) > 64) throw new Error(`prompt length ${actual} differs from requested ${tokens}`);
console.log(JSON.stringify({label, requested_tokens: tokens, wall_ms: performance.now() - started, response: data}, null, 2));
