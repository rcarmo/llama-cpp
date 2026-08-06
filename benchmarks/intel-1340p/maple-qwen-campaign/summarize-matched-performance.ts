#!/usr/bin/env bun

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const checkMode = process.argv.includes("--check");
const rootArg = process.argv.slice(2).find((arg) => arg !== "--check");
if (!rootArg) throw new Error("usage: summarize-matched-performance.ts PERFORMANCE_DIR [--check]");
const root = resolve(rootArg);
const models = ["gemma", "maple", "qwen"];
const targets = ["512", "4096", "32768", "generation"];

type Row = Record<string, number | string>;

function readTsv(path: string): Row[] {
  const lines = readFileSync(path, "utf8").trim().split("\n");
  const keys = lines.shift()!.split("\t");
  return lines.map((line) => Object.fromEntries(line.split("\t").map((value, index) => [keys[index], index < 2 ? value : Number(value)])));
}

const result: Record<string, unknown> = {};
for (const model of models) {
  const runs: Record<string, unknown> = {};
  for (const target of targets) {
    const dir = join(root, model);
    const response = JSON.parse(readFileSync(join(dir, `response-${target}.json`), "utf8"));
    const rows = readTsv(join(dir, `samples-${target}.tsv`));
    const first = rows[0];
    const last = rows.at(-1)!;
    const max = (key: string) => Math.max(...rows.map((row) => Number(row[key])));
    const min = (key: string) => Math.min(...rows.map((row) => Number(row[key])));
    runs[target] = {
      prompt_tokens: response.timings.prompt_n,
      generated_tokens: response.timings.predicted_n,
      prompt_tps: response.timings.prompt_per_second,
      generation_tps: response.timings.predicted_per_second,
      request_wall_s: Number(readFileSync(join(dir, `${target}-wall-seconds.txt`), "utf8").trim()),
      server_prompt_ms: response.timings.prompt_ms,
      server_generation_ms: response.timings.predicted_ms,
      first_token_latency_ms: target === "generation" ? null : response.timings.prompt_ms + response.timings.predicted_ms,
      max_rss_kib: max("rss_kib"),
      max_pss_kib: max("pss_kib"),
      max_vm_swap_kib: max("vm_swap_kib"),
      process_minor_fault_delta: Number(last.minflt) - Number(first.minflt),
      process_major_fault_delta: Number(last.majflt) - Number(first.majflt),
      host_swap_in_delta: max("pswpin_delta"),
      host_swap_out_delta: max("pswpout_delta"),
      host_major_fault_delta: max("pgmaj_delta"),
      min_mem_available_kib: min("mem_available_kib"),
      min_swap_free_kib: min("swap_free_kib"),
      start_temp_mC: Number(first.pkg_temp_mC),
      max_temp_mC: max("pkg_temp_mC"),
    };
  }
  const slots = JSON.parse(readFileSync(join(root, model, "slots-before.json"), "utf8"));
  result[model] = { configured_slots: slots.length, context_per_slot: slots[0]?.n_ctx ?? null, runs };
}
const rendered = `${JSON.stringify({ protocol: "exact per-tokenizer 512/4096/32768 first-token prompts plus a 512-prompt/64-output generation probe; serial accepted services", models: result }, null, 2)}\n`;
if (checkMode) {
  if (readFileSync(join(root, "summary.json"), "utf8") !== rendered) throw new Error("performance summary mismatch");
} else {
  process.stdout.write(rendered);
}
