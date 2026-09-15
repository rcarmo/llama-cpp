#!/usr/bin/env bun

// SCRIPT_JDOC: {"summary":"Verify streamed Gemma tool-call deltas assemble into one valid OpenAI tool call.","aliases":["verify Gemma tool stream"],"domains":["llama.cpp","Gemma","HTTP"],"verbs":["verify","test"],"nouns":["SSE","tool call"],"kind":"read-only","weight":"standard","role":"entrypoint"}

const base = process.env.GEMMA_ZERO_COPY_URL ?? 'http://127.0.0.1:18094';
const response = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'X-Conversation-Id': 'verify-stream-tool'},
    body: JSON.stringify({
        model: 'gemma-4-e4b-qat-mtp-zero-copy',
        messages: [{role: 'user', content: 'Use get_temperature for Lisbon. Do not answer without calling it.'}],
        tools: [{type: 'function', function: {name: 'get_temperature', description: 'Get city temperature', parameters: {type: 'object', properties: {city: {type: 'string'}}, required: ['city']}}}],
        tool_choice: 'required',
        temperature: 0,
        max_tokens: 96,
        stream: true,
    }),
});
if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
let pending = '';
const calls: any[] = [];
let final: any;
for await (const bytes of response.body) {
    pending += new TextDecoder().decode(bytes);
    let end;
    while ((end = pending.indexOf('\n\n')) >= 0) {
        const event = pending.slice(0, end);
        pending = pending.slice(end + 2);
        const line = event.split('\n').find(value => value.startsWith('data: '));
        if (!line || line === 'data: [DONE]') continue;
        const data = JSON.parse(line.slice(6));
        for (const delta of data.choices?.[0]?.delta?.tool_calls ?? []) {
            const index = delta.index ?? 0;
            calls[index] ??= {id: '', type: '', function: {name: '', arguments: ''}};
            if (delta.id) calls[index].id = delta.id;
            if (delta.type) calls[index].type = delta.type;
            if (delta.function?.name) calls[index].function.name += delta.function.name;
            if (delta.function?.arguments) calls[index].function.arguments += delta.function.arguments;
        }
        if (data.choices?.[0]?.finish_reason) final = data;
    }
}
if (calls.length !== 1 || calls[0].function.name !== 'get_temperature') throw new Error(`bad tool calls: ${JSON.stringify(calls)}`);
const args = JSON.parse(calls[0].function.arguments);
if (args.city !== 'Lisbon') throw new Error(`bad arguments: ${JSON.stringify(args)}`);
if (final?.choices?.[0]?.finish_reason !== 'tool_calls') throw new Error(`bad finish: ${JSON.stringify(final)}`);
if (!final.zero_copy?.zero_copy || final.zero_copy.copied_bytes !== 0) throw new Error('invalid zero-copy final');
console.log(JSON.stringify({passed: true, calls, finish_reason: final.choices[0].finish_reason, zero_copy: final.zero_copy}, null, 2));
