#!/usr/bin/env bun
/** SCRIPT_JDOC:
{"summary":"Consume one Gemma SSE response and save reconstructed content plus final telemetry","kind":"read-only","weight":"standard","role":"entrypoint"}
*/
const base = process.env.GEMMA_URL!;
const request = await Bun.file(process.env.GEMMA_REQUEST!).json() as any;
request.stream = true;
const response = await fetch(`${base}/v1/chat/completions`, {
  method: 'POST',
  headers: {'Content-Type': 'application/json', 'X-Conversation-Id': process.env.GEMMA_CONVERSATION!},
  body: JSON.stringify(request),
});
if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
let pending = '', content = '', reasoning = '', final: any;
let events = 0, progress = 0, contentEvents = 0;
for await (const bytes of response.body) {
  pending += new TextDecoder().decode(bytes, {stream: true});
  let end;
  while ((end = pending.indexOf('\n\n')) >= 0) {
    const event = pending.slice(0, end); pending = pending.slice(end + 2);
    const line = event.split('\n').find(value => value.startsWith('data: '));
    if (!line || line === 'data: [DONE]') continue;
    const data = JSON.parse(line.slice(6)); events++;
    if (data.prompt_progress) progress++;
    const delta = data.choices?.[0]?.delta;
    if (typeof delta?.content === 'string' && delta.content.length) { content += delta.content; contentEvents++; }
    if (typeof delta?.reasoning_content === 'string') reasoning += delta.reasoning_content;
    if (data.choices?.[0]?.finish_reason) final = data;
  }
}
if (!final) throw new Error('missing final event');
console.log(JSON.stringify({content, reasoning, events, progress, content_events: contentEvents, finish_reason: final.choices[0].finish_reason, usage: final.usage, timings: final.timings, zero_copy: final.zero_copy}, null, 2));
