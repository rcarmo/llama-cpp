#!/usr/bin/env bun
/** SCRIPT_JDOC:
{"summary":"Qualify Gemma stream cancellation, reset recovery and serial model ownership","kind":"read-only","weight":"heavy","role":"entrypoint"}
*/
const base = process.env.GEMMA_ZERO_COPY_URL ?? 'http://127.0.0.1:19094';
const model = 'gemma-4-e4b-qat-mtp-zero-copy';
const started = performance.now();
const requestBody = (prompt: string, max_tokens: number, extra: Record<string, unknown> = {}) => JSON.stringify({model, messages: [{role: 'user', content: prompt}], temperature: 0, seed: 42, max_tokens, ...extra});

async function readEvents(response: Response, onEvent?: (data: any) => Promise<void> | void) {
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  let pending = '';
  const events: Array<{ms: number; data: any}> = [];
  for await (const bytes of response.body) {
    pending += new TextDecoder().decode(bytes);
    let end;
    while ((end = pending.indexOf('\n\n')) >= 0) {
      const event = pending.slice(0, end); pending = pending.slice(end + 2);
      const line = event.split('\n').find(value => value.startsWith('data: '));
      if (!line || line === 'data: [DONE]') continue;
      const data = JSON.parse(line.slice(6)); events.push({ms: performance.now() - started, data}); await onEvent?.(data);
    }
  }
  return events;
}

const cancelConversation = 'qualify-cancel-parity';
const controller = new AbortController();
const cancelResponse = await fetch(`${base}/v1/chat/completions`, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Conversation-Id': cancelConversation}, signal: controller.signal, body: requestBody('Write exactly 512 numbered lines, one short sentence per line. Do not stop early.', 512, {stream: true, ignore_eos: true})});
let cancelContent = 0, abortMs = 0;
try {
  await readEvents(cancelResponse, data => {
    if (typeof data.choices?.[0]?.delta?.content === 'string' && data.choices[0].delta.content.length > 0 && ++cancelContent === 3) { abortMs = performance.now() - started; controller.abort(); }
  });
} catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) throw error; }
if (cancelContent < 3 || abortMs <= 0) throw new Error(`stream did not reach cancellation gate: ${cancelContent}`);
const resetStarted = performance.now();
const resetResponse = await fetch(`${base}/v1/stream`, {method: 'DELETE', headers: {'X-Conversation-Id': cancelConversation}});
const resetData = await resetResponse.json() as any; const resetMs = performance.now() - resetStarted;
if (!resetResponse.ok || resetData.status !== 'reset') throw new Error(`reset failed: ${resetResponse.status} ${JSON.stringify(resetData)}`);
const recoveryResponse = await fetch(`${base}/v1/chat/completions`, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Conversation-Id': 'qualify-recovery-parity'}, body: requestBody('Reply with exactly RECOVERED', 32)});
const recovery = await recoveryResponse.json() as any;
if (!recoveryResponse.ok || String(recovery.choices?.[0]?.message?.content).trim() !== 'RECOVERED' || !recovery.zero_copy?.zero_copy || recovery.zero_copy.copied_bytes !== 0) throw new Error(`recovery failed: ${JSON.stringify(recovery)}`);
await fetch(`${base}/v1/stream`, {method: 'DELETE', headers: {'X-Conversation-Id': 'qualify-recovery-parity'}});

let secondSettled = false, secondStartedMs = 0, secondFinishedMs = 0;
let secondPromise: Promise<any> | undefined;
const firstResponse = await fetch(`${base}/v1/chat/completions`, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Conversation-Id': 'qualify-serial-a'}, body: requestBody('Write exactly 128 numbered lines. Each line must contain its number and the word SERIAL. Do not stop early.', 256, {stream: true, ignore_eos: true})});
let firstContent = 0;
const firstEvents = await readEvents(firstResponse, async data => {
  if (typeof data.choices?.[0]?.delta?.content !== 'string' || data.choices[0].delta.content.length === 0 || ++firstContent !== 1) return;
  secondStartedMs = performance.now() - started;
  secondPromise = fetch(`${base}/v1/chat/completions`, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Conversation-Id': 'qualify-serial-b'}, body: requestBody('Reply with exactly SERIAL_OK', 32)}).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(`serial second HTTP ${response.status}: ${JSON.stringify(data)}`); secondFinishedMs = performance.now() - started; secondSettled = true; return data; });
  await Bun.sleep(250); if (secondSettled) throw new Error('second request was not serialized behind active generation');
});
const firstFinal = firstEvents.findLast(event => event.data.choices?.[0]?.finish_reason);
if (!firstFinal?.data.zero_copy?.zero_copy || firstFinal.data.zero_copy.copied_bytes !== 0 || firstContent < 2 || !secondPromise) throw new Error('serial first failed');
const firstFinishedMs = performance.now() - started; const second = await secondPromise;
if (secondFinishedMs < firstFinishedMs || String(second.choices?.[0]?.message?.content).trim() !== 'SERIAL_OK' || !second.zero_copy?.zero_copy || second.zero_copy.copied_bytes !== 0) throw new Error(`serial second failed: ${JSON.stringify(second)}`);
await fetch(`${base}/v1/stream`, {method: 'DELETE', headers: {'X-Conversation-Id': 'qualify-serial-b'}});
console.log(JSON.stringify({passed: true, cancellation: {content_events_before_abort: cancelContent, abort_ms: abortMs, reset_ms: resetMs}, recovery: {content: recovery.choices[0].message.content, zero_copy: recovery.zero_copy}, serial: {first_content_events: firstContent, second_started_ms: secondStartedMs, first_finished_ms: firstFinishedMs, second_finished_ms: secondFinishedMs, queued_for_ms: secondFinishedMs - secondStartedMs, first_zero_copy: firstFinal.data.zero_copy, second_zero_copy: second.zero_copy}}, null, 2));
