#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:8092";
const model = process.argv[3] ?? "maple-preview-tq2-exact-head";
const outDir = resolve(process.argv[4] ?? "benchmarks/intel-1340p/maple-preview/production-context/api-validation");
const expectedTemplateSha256 = "83e4c58ca602ade89b126cc75a036eb8bd06d373d4fd94b09d2277d609131089";
await mkdir(outDir, { recursive: true });

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function jsonRequest(path: string, body?: unknown, signal?: AbortSignal): Promise<any> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path}: ${response.status} ${text}`);
  return JSON.parse(text);
}

const results: Record<string, unknown> = {
  generated_at: new Date().toISOString(),
  base_url: baseUrl,
  model,
  checks: {},
};
const checks = results.checks as Record<string, unknown>;

const health = await jsonRequest("/health");
assert(health.status === "ok", "health failed");
const models = await jsonRequest("/v1/models");
assert(models.data?.some((entry: any) => entry.id === model && entry.meta?.n_ctx === 131072), "model/context missing");
const props = await jsonRequest("/props");
const template = props.chat_template;
assert(typeof template === "string", "chat template missing");
const templateSha256 = createHash("sha256").update(template).digest("hex");
const templateSha256WithNewline = createHash("sha256").update(`${template}\n`).digest("hex");
assert([templateSha256, templateSha256WithNewline].includes(expectedTemplateSha256), "chat template hash mismatch");
checks.discovery = { template_sha256: templateSha256, source_template_sha256: expectedTemplateSha256, context: 131072 };
await Bun.write(resolve(outDir, "discovery.json"), `${JSON.stringify(checks.discovery, null, 2)}\n`);

const basic = await jsonRequest("/v1/chat/completions", {
  model,
  messages: [{ role: "user", content: "Reply with exactly MAPLE_OK." }],
  temperature: 0,
  seed: 42,
  max_tokens: 128,
});
assert(basic.choices?.[0]?.message?.content?.trim() === "MAPLE_OK", "basic instruction failed");
assert(typeof basic.choices[0].message.reasoning_content === "string" && basic.choices[0].message.reasoning_content.length > 0, "reasoning was not separated");
assert(!basic.choices[0].message.content.includes("<think>") && !basic.choices[0].message.content.includes("</think>"), "reasoning leaked into content");
checks.basic = { usage: basic.usage, timings: basic.timings };
await Bun.write(resolve(outDir, "basic.json"), `${JSON.stringify(basic, null, 2)}\n`);

const tool = {
  type: "function",
  function: {
    name: "search_repository",
    description: "Search repository source files for a symbol or phrase.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string" },
        path: { type: "string" },
        max_results: { type: "integer", minimum: 1, maximum: 20 },
      },
      required: ["query", "path", "max_results"],
    },
  },
};
const toolMessages = [
  { role: "system", content: "Use the supplied repository tool. Do not answer from memory." },
  { role: "user", content: "Find the implementation that submits bounded asynchronous mmap advice for selected routed experts. Search narrowly for MADV_WILLNEED under ggml/src/ggml-cpu and return the first three results." },
];
const requiredTool = await jsonRequest("/v1/chat/completions", {
  model,
  messages: toolMessages,
  tools: [tool],
  tool_choice: "required",
  parallel_tool_calls: false,
  temperature: 0,
  seed: 303,
  max_tokens: 256,
});
const calls = requiredTool.choices?.[0]?.message?.tool_calls;
assert(requiredTool.choices?.[0]?.finish_reason === "tool_calls", "tool finish reason missing");
assert(Array.isArray(calls) && calls.length === 1, "expected exactly one tool call");
const call = calls[0];
assert(call?.type === "function" && typeof call.id === "string" && call.id.length > 0, "tool call envelope invalid");
assert(call?.function?.name === "search_repository", "required tool not selected");
const args = JSON.parse(call.function.arguments);
assert(Object.keys(args).sort().join(",") === "max_results,path,query", "tool arguments have missing or extra keys");
assert(args.query === "MADV_WILLNEED", "tool query incorrect");
assert(typeof args.path === "string" && args.path.includes("ggml") && args.path.includes("ggml-cpu"), "tool path incorrect");
assert(Number.isInteger(args.max_results) && args.max_results >= 1 && args.max_results <= 20, "tool max_results invalid");
assert(!requiredTool.choices[0].message.content, "tool call leaked content");
assert(typeof requiredTool.choices[0].message.reasoning_content === "string" && requiredTool.choices[0].message.reasoning_content.length > 0, "tool-call reasoning was not separated");
checks.required_tool = { arguments: args, usage: requiredTool.usage, timings: requiredTool.timings };
await Bun.write(resolve(outDir, "required-tool.json"), `${JSON.stringify(requiredTool, null, 2)}\n`);

const followup = await jsonRequest("/v1/chat/completions", {
  model,
  messages: [
    ...toolMessages,
    requiredTool.choices[0].message,
    {
      role: "tool",
      tool_call_id: call.id,
      content: JSON.stringify([
        { path: "ggml/src/ggml-cpu/whole-token-profile.cpp", line: 1 },
        { path: "ggml/src/ggml-cpu/expert-io-plan.cpp", line: 1 },
        { path: "tools/server/server-context.cpp", line: 1 },
      ]),
    },
  ],
  tools: [tool],
  tool_choice: "auto",
  temperature: 0,
  seed: 303,
  max_tokens: 256,
});
const followupContent = followup.choices?.[0]?.message?.content ?? "";
assert(followupContent.includes("whole-token-profile.cpp") && followupContent.includes("expert-io-plan.cpp"), "tool response was not used");
assert(typeof followup.choices[0].message.reasoning_content === "string" && followup.choices[0].message.reasoning_content.length > 0, "followup reasoning was not separated");
assert(!followupContent.includes("<think>") && !followupContent.includes("</think>"), "followup reasoning leaked");
checks.tool_response = { content: followupContent, usage: followup.usage, timings: followup.timings };
await Bun.write(resolve(outDir, "tool-response.json"), `${JSON.stringify(followup, null, 2)}\n`);

const stopMessages = [{ role: "user", content: "Reply with exactly: ALPHA STOPME OMEGA" }];
const stopControl = await jsonRequest("/v1/chat/completions", {
  model, messages: stopMessages, temperature: 0, seed: 11, max_tokens: 128,
  chat_template_kwargs: { enable_thinking: false },
});
assert(stopControl.choices?.[0]?.message?.content?.trim() === "ALPHA STOPME OMEGA", "stop control did not emit the exact marker sequence");
const stop = await jsonRequest("/v1/chat/completions", {
  model, messages: stopMessages, temperature: 0, seed: 11, max_tokens: 128, stop: ["STOPME"],
  chat_template_kwargs: { enable_thinking: false },
});
assert(stop.choices?.[0]?.finish_reason === "stop", "stop sequence did not terminate");
const stoppedRaw = `${stop.choices[0].message.reasoning_content ?? ""}${stop.choices[0].message.content ?? ""}`;
assert(stop.usage.completion_tokens < stopControl.usage.completion_tokens, "stop sequence did not shorten completion");
assert(!stoppedRaw.includes("STOPME") && !stoppedRaw.includes("OMEGA"), "stop sequence leaked into reasoning or content");
checks.stop = {
  control: stopControl.choices[0].message.content,
  stopped_content: stop.choices[0].message.content,
  stopped_reasoning: stop.choices[0].message.reasoning_content,
  usage: stop.usage,
};
await Bun.write(resolve(outDir, "stop-control.json"), `${JSON.stringify(stopControl, null, 2)}\n`);
await Bun.write(resolve(outDir, "stop.json"), `${JSON.stringify(stop, null, 2)}\n`);

const streamResponse = await fetch(`${baseUrl}/v1/chat/completions`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    model,
    messages: [{ role: "user", content: "Reply with exactly STREAM_OK." }],
    temperature: 0,
    seed: 43,
    max_tokens: 64,
    stream: true,
    stream_options: { include_usage: true },
    chat_template_kwargs: { enable_thinking: false },
  }),
});
assert(streamResponse.ok && streamResponse.body, "SSE request failed");
assert(streamResponse.headers.get("content-type")?.startsWith("text/event-stream"), "SSE content type missing");
const streamReader = streamResponse.body.getReader();
const decoder = new TextDecoder();
let streamText = "";
let streamReads = 0;
while (true) {
  const { value, done } = await streamReader.read();
  if (done) break;
  streamReads++;
  streamText += decoder.decode(value, { stream: true });
}
streamText += decoder.decode();
const events = streamText.replaceAll("\r\n", "\n").split("\n\n").flatMap((event) => {
  const data = event.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
  return data ? [data] : [];
});
assert(events.at(-1) === "[DONE]", "SSE terminal event missing");
const chunks = events.slice(0, -1).map((event) => JSON.parse(event));
const streamContent = chunks.map((chunk) => chunk.choices?.[0]?.delta?.content ?? "").join("");
const streamReasoning = chunks.map((chunk) => chunk.choices?.[0]?.delta?.reasoning_content ?? "").join("");
assert(streamReads > 1, "SSE response was delivered in one buffered read");
assert(streamContent.trim() === "STREAM_OK", "SSE content incorrect");
assert(streamReasoning.length > 0, "SSE reasoning was not separated");
assert(!streamContent.includes("<think>") && !streamContent.includes("</think>"), "SSE reasoning leaked into content");
const terminalUsage = chunks.at(-1)?.usage;
assert(terminalUsage?.total_tokens > 0, "SSE terminal usage missing");
checks.sse = { content: streamContent, reasoning_chars: streamReasoning.length, events: chunks.length, reads: streamReads, usage: terminalUsage };
await Bun.write(resolve(outDir, "sse.txt"), streamText);
await Bun.write(resolve(outDir, "sse-summary.json"), `${JSON.stringify(checks.sse, null, 2)}\n`);

const controller = new AbortController();
const cancelPromise = fetch(`${baseUrl}/v1/chat/completions`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ model, messages: [{ role: "user", content: "Count upward forever, one integer per line." }], temperature: 0, max_tokens: 4096, stream: true }),
  signal: controller.signal,
});
const cancelResponse = await cancelPromise;
assert(cancelResponse.body, "cancellation stream missing");
const reader = cancelResponse.body.getReader();
await reader.read();
const activeSlots = await jsonRequest("/slots");
assert(activeSlots.some((slot: any) => slot.is_processing), "cancellation request was not active");
const cancelStarted = performance.now();
await reader.cancel("Maple API cancellation validation");
controller.abort();
let recovered = false;
for (let attempt = 0; attempt < 100; attempt++) {
  const slots = await jsonRequest("/slots");
  if (slots.every((slot: any) => !slot.is_processing)) { recovered = true; break; }
  await Bun.sleep(50);
}
assert(recovered, "slot did not recover after cancellation");
checks.cancellation = { recovered: true, recovery_ms: performance.now() - cancelStarted };
await Bun.write(resolve(outDir, "cancellation.json"), `${JSON.stringify(checks.cancellation, null, 2)}\n`);

await Bun.write(resolve(outDir, "result.json"), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
