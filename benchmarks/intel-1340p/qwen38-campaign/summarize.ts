#!/usr/bin/env bun

import { resolve } from "node:path";

const here = resolve(import.meta.dir);
const probes = ["512", "4096", "32768", "generation"] as const;
const variants = ["target", "mtp"] as const;

async function json(path: string): Promise<any | null> {
  const file = Bun.file(path);
  if (!(await file.exists()) || file.size === 0) return null;
  try { return await file.json(); } catch { return null; }
}

async function telemetry(path: string): Promise<any | null> {
  const file = Bun.file(path);
  if (!(await file.exists()) || file.size === 0) return null;
  const lines = (await file.text()).trim().split("\n");
  if (lines.length < 2) return null;
  const keys = lines[0].split("\t");
  const rows = lines.slice(1).map((line) => Object.fromEntries(line.split("\t").map((value, i) => [keys[i], Number(value)])));
  const max = (key: string) => Math.max(...rows.map((row) => row[key]));
  const min = (key: string) => Math.min(...rows.map((row) => row[key]));
  const last = rows.at(-1)!;
  return {
    samples: rows.length,
    elapsed_s: last.elapsed,
    max_rss_kib: max("rss_kib"),
    max_pss_kib: max("pss_kib"),
    max_process_swap_kib: max("vm_swap_kib"),
    min_mem_available_kib: min("mem_available_kib"),
    min_swap_free_kib: min("swap_free_kib"),
    max_host_swap_in_pages: max("pswpin_delta"),
    max_host_swap_out_pages: max("pswpout_delta"),
    max_host_major_fault_delta: max("pgmaj_delta"),
    max_temp_mC: max("pkg_temp_mC"),
  };
}

const performance: Record<string, any> = {};
for (const variant of variants) {
  performance[variant] = {};
  for (const probe of probes) {
    const response = await json(`${here}/performance/${variant}/response-${probe}.json`);
    if (!response?.timings) continue;
    performance[variant][probe] = {
      prompt_tokens: response.timings.prompt_n,
      generated_tokens: response.timings.predicted_n,
      prompt_tps: response.timings.prompt_per_second,
      generation_tps: response.timings.predicted_per_second,
      prompt_ms: response.timings.prompt_ms,
      generation_ms: response.timings.predicted_ms,
      draft_tokens: response.timings.draft_n ?? null,
      accepted_draft_tokens: response.timings.draft_n_accepted ?? null,
      telemetry: await telemetry(`${here}/performance/${variant}/samples-${probe}.tsv`),
    };
  }
}

const targetGeneration = performance.target.generation?.generation_tps;
const mtpGeneration = performance.mtp.generation?.generation_tps;
const quality = await json(`${here}/quality/qwen38/summary.json`);
const vision = await json(`${here}/vision/response.json`);
const result = {
  protocol: "exact per-tokenizer 512/4096/32768 first-token prompts plus a 512-prompt/64-output generation probe; serial service switching; CPUs 0-7; eight threads; below-60 C/load-below-1.5 start gate; three-sample 97 C abort",
  performance,
  mtp_generation_uplift_percent: targetGeneration && mtpGeneration ? (mtpGeneration / targetGeneration - 1) * 100 : null,
  quality,
  vision: vision ? {
    content: vision.choices?.[0]?.message?.content ?? null,
    prompt_tokens: vision.timings?.prompt_n ?? vision.usage?.prompt_tokens ?? null,
    generated_tokens: vision.timings?.predicted_n ?? vision.usage?.completion_tokens ?? null,
  } : null,
};
await Bun.write(`${here}/summary.json`, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
