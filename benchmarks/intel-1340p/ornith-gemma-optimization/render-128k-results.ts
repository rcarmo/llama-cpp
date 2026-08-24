#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = import.meta.dir;
const summaryPath = process.argv[2] ?? join(root, "validation/candidate-128k/summary.json");
const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
if (!summary.complete) throw new Error("128K summary is incomplete");
for (const profile of ["ornith", "gemma4"]) {
  if (summary.profiles?.[profile]?.status !== "passed") throw new Error(`${profile} did not pass 128K validation`);
}
const o = summary.profiles.ornith;
const g = summary.profiles.gemma4;
const mib = (kib: number) => (kib / 1024).toFixed(0);
const seconds = (v: number) => Number(v).toFixed(0);
const tps = (v: number) => Number(v).toFixed(2);
const md = `# Ornith and Gemma near-capacity 128K validation

Both selected CPU profiles completed frozen model-specific requests in one 131,072-token slot with batch 1024 / ubatch 256, F16 KV and Flash Attention disabled.

| Model | Prompt tokens | Prompt | Generation | Elapsed | Draft acceptance | Peak PSS | Peak temperature |
|---|---:|---:|---:|---:|---:|---:|---:|
| Ornith | ${o.prompt_tokens.toLocaleString()} | ${tps(o.prompt_tps)} tok/s | ${tps(o.generation_tps)} tok/s | ${seconds(o.elapsed_s)} s | ${o.accepted_draft_tokens}/${o.draft_tokens} | ${mib(o.max_pss_kib)} MiB | ${(o.max_temp_mC/1000).toFixed(0)} °C |
| Gemma | ${g.prompt_tokens.toLocaleString()} | ${tps(g.prompt_tps)} tok/s | ${tps(g.generation_tps)} tok/s | ${seconds(g.elapsed_s)} s | ${g.accepted_draft_tokens}/${g.draft_tokens} | ${mib(g.max_pss_kib)} MiB | ${(g.max_temp_mC/1000).toFixed(0)} °C |

Both responses ended with exactly one valid \`search_repository\` tool call, retained generation headroom, used speculative decoding and completed without a thermal-abort marker.

## Selected 128K settings

| Setting | Ornith | Gemma |
|---|---:|---:|
| Context | ${o.context} | ${g.context} |
| Batch / ubatch | ${o.batch} / ${o.ubatch} | ${g.batch} / ${g.ubatch} |
| KV | ${o.kv} | ${g.kv} |
| Flash Attention | ${o.flash_attn} | ${g.flash_attn} |
| MTP depth | 2 | 3 |
| Threads | 8 | 8 |

Raw evidence is under \`validation/candidate-128k/\`; frozen requests and tokenization metadata are under \`workloads/near-capacity-128k/\`.
`;
writeFileSync(join(root, "validation/candidate-128k/README.md"), md);
console.log(md);
