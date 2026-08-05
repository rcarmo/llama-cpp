#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { basename, resolve } from "node:path";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:8092";
const sourcePath = resolve(process.argv[3] ?? "benchmarks/intel-1340p/ornith-gemma-optimization/workloads/near-capacity-128k/ornith-content.txt");
const outDir = resolve(process.argv[4] ?? "benchmarks/intel-1340p/maple-preview/production-context/generated");
const targets = [65536, 124000];
const source = await Bun.file(sourcePath).text();

async function tokenize(text: string): Promise<number> {
  const response = await fetch(`${baseUrl}/tokenize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: text, add_special: false, with_pieces: false }),
  });
  if (!response.ok) throw new Error(`tokenize failed: ${response.status} ${await response.text()}`);
  const body = await response.json() as { tokens: number[] };
  return body.tokens.length;
}

async function closestPrefix(target: number): Promise<{ text: string; chars: number; tokens: number }> {
  let low = 0;
  let high = source.length;
  let best = { chars: 0, tokens: 0 };
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const tokens = await tokenize(source.slice(0, mid));
    if (Math.abs(tokens - target) < Math.abs(best.tokens - target)) best = { chars: mid, tokens };
    if (tokens < target) low = mid + 1;
    else if (tokens > target) high = mid - 1;
    else return { text: source.slice(0, mid), chars: mid, tokens };
  }
  for (let chars = Math.max(0, best.chars - 32); chars <= Math.min(source.length, best.chars + 32); chars++) {
    const tokens = await tokenize(source.slice(0, chars));
    if (Math.abs(tokens - target) < Math.abs(best.tokens - target)) best = { chars, tokens };
    if (tokens === target) break;
  }
  return { text: source.slice(0, best.chars), ...best };
}

await mkdir(outDir, { recursive: true });
const sourceSha256 = createHash("sha256").update(source).digest("hex");
const manifest: Record<string, unknown> = {
  generated_at: new Date().toISOString(),
  tokenizer_endpoint: baseUrl,
  source: basename(sourcePath),
  source_sha256: sourceSha256,
  source_chars: source.length,
  prompts: [],
};

for (const target of targets) {
  const prefix = await closestPrefix(target);
  const label = target === 65536 ? "64k" : "124k";
  const promptPath = resolve(outDir, `prompt-${label}.txt`);
  const payloadPath = resolve(outDir, `completion-${label}.json`);
  const payload = {
    prompt: prefix.text,
    n_predict: 1,
    temperature: 0,
    seed: 731,
    cache_prompt: true,
  };
  const payloadJson = `${JSON.stringify(payload)}\n`;
  await Bun.write(promptPath, prefix.text);
  await Bun.write(payloadPath, payloadJson);
  (manifest.prompts as unknown[]).push({
    label,
    target_tokens: target,
    prompt_tokens: prefix.tokens,
    prompt_chars: prefix.chars,
    prompt_sha256: createHash("sha256").update(prefix.text).digest("hex"),
    payload_sha256: createHash("sha256").update(payloadJson).digest("hex"),
    prompt_file: basename(promptPath),
    payload_file: basename(payloadPath),
  });
}

await Bun.write(resolve(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest, null, 2));
