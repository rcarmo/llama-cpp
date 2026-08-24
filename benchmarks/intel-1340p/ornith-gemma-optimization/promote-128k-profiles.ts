#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const repo = resolve(import.meta.dir, "../../..");
const summaryPath = process.argv[2] ?? join(import.meta.dir, "validation/candidate-128k/summary.json");
const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
if (!summary.complete) throw new Error("refusing promotion: 128K validation is incomplete");
for (const profile of ["ornith", "gemma4"]) {
  const run = summary.profiles?.[profile];
  if (run?.status !== "passed") throw new Error(`refusing promotion: ${profile} did not pass`);
  if (run.context !== 131072 || run.batch !== 1024 || run.ubatch !== 256 || run.kv !== "f16" || run.flash_attn !== "off") {
    throw new Error(`refusing promotion: ${profile} effective profile does not match selected 128K settings`);
  }
}

function replaceExact(path: string, oldText: string, newText: string) {
  const text = readFileSync(path, "utf8");
  if (!text.includes(oldText)) throw new Error(`expected text not found in ${path}: ${JSON.stringify(oldText)}`);
  if (text.indexOf(oldText) !== text.lastIndexOf(oldText)) throw new Error(`expected unique text in ${path}: ${JSON.stringify(oldText)}`);
  writeFileSync(path, text.replace(oldText, newText));
}

function replaceMarked(path: string, begin: string, end: string, body: string) {
  const text = readFileSync(path, "utf8");
  const start = text.indexOf(begin);
  const finish = text.indexOf(end);
  if (start < 0 || finish < 0 || finish < start) throw new Error(`status markers missing in ${path}`);
  if (text.indexOf(begin, start + begin.length) >= 0 || text.indexOf(end, finish + end.length) >= 0) throw new Error(`status markers not unique in ${path}`);
  writeFileSync(path, text.slice(0, start) + begin + "\n" + body.trim() + "\n" + end + text.slice(finish + end.length));
}

for (const profile of ["ornith", "gemma4"]) {
  const path = join(repo, `tools/config/llama-${profile}-candidate.env.example`);
  replaceExact(path, "LLAMA_CTX=32768", "LLAMA_CTX=131072");
  replaceExact(path, "LLAMA_BATCH=512", "LLAMA_BATCH=1024");
  replaceExact(path, "LLAMA_UBATCH=128", "LLAMA_UBATCH=256");
  replaceExact(path, "LLAMA_HTTP_TIMEOUT=3600", "LLAMA_HTTP_TIMEOUT=10800");
}

const fmt = (n: number, digits = 2) => Number(n).toFixed(digits);
const mib = (kib: number) => Math.round(kib / 1024);
const lines = [];
for (const [label, key] of [["Ornith", "ornith"], ["Gemma 4", "gemma4"]] as const) {
  const x = summary.profiles[key];
  lines.push(`| ${label} | ${Number(x.prompt_tokens).toLocaleString()} | ${fmt(x.prompt_tps)} tok/s | ${fmt(x.generation_tps)} tok/s | ${Math.round(x.elapsed_s)} s | ${x.accepted_draft_tokens}/${x.draft_tokens} | ${mib(x.max_pss_kib)} MiB | ${Math.round(x.max_temp_mC / 1000)} °C |`);
}
const snippet = `## Verified 128K profile\n\nNear-capacity validation completed with one 131,072-token slot, batch 1024, ubatch 256, F16 KV, Flash Attention off and the model-specific MTP depth.\n\n| Model | Prompt tokens | Prompt | Generation | Elapsed | Draft acceptance | Peak PSS | Peak temperature |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${lines.join("\n")}\n\nBoth frozen requests retained output headroom, ended with exactly one schema-valid \`search_repository\` tool call, used speculative decoding and completed without a thermal-abort marker.\n`;
writeFileSync(join(import.meta.dir, "validation/candidate-128k/runbook-snippet.md"), snippet);

const begin = "<!-- INTEL_128K_STATUS_BEGIN -->";
const end = "<!-- INTEL_128K_STATUS_END -->";
replaceMarked(join(repo, "README.md"), begin, end,
  `Near-capacity 128K validation passed for both candidates with batch 1024 / ubatch 256, F16 KV and Flash Attention off. Ornith and Gemma are validated 128K candidates; Qwen remains the deployed rollback baseline until an operator explicitly switches services.\n\n${snippet}`);
replaceMarked(join(repo, "docs/intel-1340p-ornith-gemma-campaign.md"), begin, end,
  `Near-capacity 128K validation passed for Ornith and Gemma with the selected 1024/256 geometry. Qwen remains the deployed rollback baseline; candidate activation remains an explicit operator decision.\n\n${snippet}`);
for (const [profile, label, runbook] of [["ornith", "Ornith", "intel-1340p-ornith-runbook.md"], ["gemma4", "Gemma", "intel-1340p-gemma4-runbook.md"]] as const) {
  const x = summary.profiles[profile];
  replaceMarked(join(repo, `docs/${runbook}`), begin, end,
    `${label} passed near-capacity 128K validation with ${Number(x.prompt_tokens).toLocaleString()} prompt tokens, ${fmt(x.prompt_tps)} prompt tok/s, ${fmt(x.generation_tps)} generation tok/s, ${x.accepted_draft_tokens}/${x.draft_tokens} draft acceptance, ${mib(x.max_pss_kib)} MiB peak PSS and ${Math.round(x.max_temp_mC / 1000)} °C peak package temperature. The selected profile is context 131072, batch 1024, ubatch 256, F16 KV and Flash Attention off. Qwen remains the rollback baseline.`);
}
console.log(snippet);
