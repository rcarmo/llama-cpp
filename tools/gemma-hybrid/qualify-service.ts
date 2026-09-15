#!/usr/bin/env bun

const base = process.env.GEMMA_ZERO_COPY_URL ?? 'http://127.0.0.1:18094';
const model = 'gemma-4-e4b-qat-mtp-zero-copy';
const results: Record<string, unknown>[] = [];

async function request(name: string, body: Record<string, unknown>, conversation = name) {
    const started = performance.now();
    const response = await fetch(`${base}/v1/chat/completions`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'X-Conversation-Id': conversation},
        body: JSON.stringify({model, temperature: 0, stream: false, ...body}),
    });
    const data = await response.json() as any;
    results.push({name, status: response.status, wall_ms: performance.now() - started, data});
    if (!response.ok) throw new Error(`${name}: ${JSON.stringify(data)}`);
    return data;
}

async function reset(conversation: string) {
    const response = await fetch(`${base}/v1/stream`, {method: 'DELETE', headers: {'X-Conversation-Id': conversation}});
    if (!response.ok) throw new Error(`reset ${conversation}: ${await response.text()}`);
}

const appendConversation = 'qualify-append';
const firstMessages = [{role: 'user', content: 'Remember the nonce 7319 and reply only: remembered'}];
const first = await request('append-first', {messages: firstMessages, max_tokens: 16}, appendConversation);
const secondMessages = [...firstMessages, first.choices[0].message, {role: 'user', content: 'What nonce did I ask you to remember? Reply with digits only.'}];
const second = await request('append-second', {messages: secondMessages, max_tokens: 16}, appendConversation);
if (!String(second.choices[0].message.content).includes('7319')) throw new Error('warm append lost the nonce');
if (second.zero_copy.route !== 'cpu_mtp_reuse' || second.zero_copy.cached_tokens <= 0) throw new Error('warm append did not reuse CPU KV');
await reset(appendConversation);

const toolConversation = 'qualify-tool';
const tools = [{type: 'function', function: {name: 'get_temperature', description: 'Get a city temperature', parameters: {type: 'object', properties: {city: {type: 'string'}}, required: ['city']}}}];
const toolMessages = [{role: 'user', content: 'Use get_temperature for Lisbon. Do not answer without calling it.'}];
const toolFirst = await request('tool-call', {messages: toolMessages, tools, max_tokens: 96}, toolConversation);
const calls = toolFirst.choices[0].message.tool_calls;
if (!Array.isArray(calls) || calls.length !== 1 || calls[0].function.name !== 'get_temperature') throw new Error('tool call was not parsed');
const toolResultMessages = [...toolMessages, toolFirst.choices[0].message, {role: 'tool', tool_call_id: calls[0].id, content: '{"temperature_c":22}'}];
const toolSecond = await request('tool-result', {messages: toolResultMessages, tools, max_tokens: 64}, toolConversation);
if (!String(toolSecond.choices[0].message.content).includes('22')) throw new Error('tool result was not used');
await reset(toolConversation);

const factual = await request('factual', {messages: [{role: 'user', content: 'What is the capital of Portugal? Reply with the city only.'}], max_tokens: 16});
if (!String(factual.choices[0].message.content).toLowerCase().includes('lisbon')) throw new Error('factual answer failed');
await reset('factual');

const arithmetic = await request('arithmetic', {messages: [{role: 'user', content: 'Calculate 17 * 19. Reply with digits only.'}], max_tokens: 16});
if (!String(arithmetic.choices[0].message.content).includes('323')) throw new Error('arithmetic answer failed');
await reset('arithmetic');

const coding = await request('coding', {messages: [{role: 'user', content: 'Write a JavaScript function named add that returns the sum of two arguments. Output code only.'}], max_tokens: 96});
const code = String(coding.choices[0].message.content);
if (!code.includes('add') || !code.includes('return')) throw new Error('coding answer failed');
await reset('coding');

for (const row of results) {
    const data: any = row.data;
    const z = data.zero_copy;
    if (!z || !Number.isFinite(z.wall_s) || !Number.isFinite(z.decode_tps) || z.copied_bytes !== 0) throw new Error(`${row.name}: invalid telemetry`);
}

console.log(JSON.stringify({passed: true, results}, null, 2));
