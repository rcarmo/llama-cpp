#!/usr/bin/env bun

import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:8092";
const model = process.argv[3] ?? "maple-preview-tq2-exact-head";
const outDir = resolve(process.argv[4] ?? "benchmarks/intel-1340p/maple-preview/production-context/api-validation");
await mkdir(outDir, { recursive: true });

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function slots(): Promise<any[]> {
  const response = await fetch(`${baseUrl}/slots`);
  if (!response.ok) throw new Error(`slots: ${response.status} ${await response.text()}`);
  return response.json() as Promise<any[]>;
}

const controller = new AbortController();
const response = await fetch(`${baseUrl}/v1/chat/completions`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    model,
    messages: [{ role: "user", content: "Count upward forever, one integer per line." }],
    temperature: 0,
    max_tokens: 4096,
    stream: true,
  }),
  signal: controller.signal,
});
assert(response.ok && response.body, "cancellation stream missing");
const reader = response.body.getReader();
await reader.read();
const active = await slots();
assert(active.some((slot) => slot.is_processing), "cancellation request was not active");
const started = performance.now();
await reader.cancel("Maple API cancellation validation");
controller.abort();
let recovered = false;
let final: any[] = [];
for (let attempt = 0; attempt < 200; attempt++) {
  final = await slots();
  if (final.every((slot) => !slot.is_processing)) {
    recovered = true;
    break;
  }
  await Bun.sleep(25);
}
assert(recovered, "slot did not recover after cancellation");
const result = {
  active_before_cancel: active.map((slot) => ({ id: slot.id, is_processing: slot.is_processing, task_id: slot.task_id })),
  idle_after_cancel: final.map((slot) => ({ id: slot.id, is_processing: slot.is_processing, task_id: slot.task_id })),
  recovery_ms: performance.now() - started,
};
await Bun.write(resolve(outDir, "cancellation.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
