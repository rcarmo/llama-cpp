#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { resolve } from "node:path";

const [baseUrl, sourceArg, outArg] = process.argv.slice(2);
if (!baseUrl || !sourceArg || !outArg) throw new Error("usage: build-1024-fixture.ts BASE_URL SOURCE OUT_DIR");
const source = await Bun.file(resolve(sourceArg)).text();
const out = resolve(outArg);

async function count(text: string): Promise<number> {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/tokenize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: text, add_special: true }),
  });
  if (!response.ok) throw new Error(`tokenize failed: ${response.status} ${await response.text()}`);
  return (await response.json() as { tokens: unknown[] }).tokens.length;
}

let lo = 0;
let hi = source.length;
while (lo < hi) {
  const mid = Math.floor((lo + hi) / 2);
  if (await count(source.slice(0, mid)) < 1024) lo = mid + 1;
  else hi = mid;
}
let chars = lo;
let tokens = await count(source.slice(0, chars));
for (let delta = 0; tokens !== 1024 && delta <= 4096; delta++) {
  for (const candidate of [lo - delta, lo + delta]) {
    if (candidate < 0 || candidate > source.length) continue;
    const candidateTokens = await count(source.slice(0, candidate));
    if (candidateTokens === 1024) {
      chars = candidate;
      tokens = candidateTokens;
      break;
    }
  }
}
if (tokens !== 1024) throw new Error(`no exact 1024-token prefix found; closest candidate had ${tokens}`);
const prompt = source.slice(0, chars);
const payload = `${JSON.stringify({ prompt, n_predict: 1, temperature: 0, seed: 731, cache_prompt: false })}\n`;
await Bun.write(resolve(out, "prompt-1024.txt"), prompt);
await Bun.write(resolve(out, "completion-1024.json"), payload);
await Bun.write(resolve(out, "manifest-1024.json"), `${JSON.stringify({
  tokenizer_endpoint: baseUrl,
  source: sourceArg,
  target_tokens: 1024,
  prompt_tokens: tokens,
  prompt_chars: chars,
  prompt_sha256: createHash("sha256").update(prompt).digest("hex"),
  payload_sha256: createHash("sha256").update(payload).digest("hex"),
}, null, 2)}\n`);
console.log(JSON.stringify({ chars, tokens }));
