#!/usr/bin/env bun

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

type Fixture = {
  id: string;
  description: string;
  request: Record<string, unknown>;
  expect?: { tool_name?: string };
};

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`missing --${name}`);
}

const url = arg("url", "http://127.0.0.1:8080").replace(/\/$/, "");
const quant = arg("quant") as "q2" | "q4";
const mtpDepth = Number(arg("mtp-depth", "0"));
const repetitions = Number(arg("repetitions", "3"));
const corpusDir = arg("corpus", join(import.meta.dir, "corpus"));
const outDir = arg("out");
const onlyCases = new Set(arg("cases", "").split(",").filter(Boolean));

if (!(["q2", "q4"] as const).includes(quant)) throw new Error("--quant must be q2 or q4");
if (!Number.isInteger(mtpDepth) || mtpDepth < 0 || mtpDepth > 3) throw new Error("--mtp-depth must be 0..3");
if (!Number.isInteger(repetitions) || repetitions < 1) throw new Error("--repetitions must be positive");

await mkdir(outDir, { recursive: true });
const fixtures = (await readdir(corpusDir))
  .filter((name) => name.endsWith(".json"))
  .sort()
  .filter((name) => onlyCases.size === 0 || onlyCases.has(basename(name, ".json")));
const rows: Record<string, unknown>[] = [];

for (const file of fixtures) {
  const fixture = JSON.parse(await readFile(join(corpusDir, file), "utf8")) as Fixture;
  for (let repetition = 1; repetition <= repetitions; repetition++) {
    const started = performance.now();
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fixture.request),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`${fixture.id}: HTTP ${response.status}: ${text}`);
    const body = JSON.parse(text);
    const wallMs = performance.now() - started;
    const choice = body.choices?.[0];
    const timings = body.timings ?? {};
    const toolName = choice?.message?.tool_calls?.[0]?.function?.name ?? null;
    const semanticOk = !fixture.expect?.tool_name || toolName === fixture.expect.tool_name;
    const row = {
      case_id: fixture.id,
      quant,
      mtp_depth: mtpDepth,
      repetition,
      wall_ms: wallMs,
      prompt_tokens: Number(timings.prompt_n ?? body.usage?.prompt_tokens ?? 0),
      generated_tokens: Number(timings.predicted_n ?? body.usage?.completion_tokens ?? 0),
      prompt_tps: Number(timings.prompt_per_second ?? 0),
      generation_tps: Number(timings.predicted_per_second ?? 0),
      draft_tokens: Number(timings.draft_n ?? 0),
      accepted_draft_tokens: Number(timings.draft_n_accepted ?? 0),
      finish_reason: choice?.finish_reason ?? null,
      tool_name: toolName,
      semantic_ok: semanticOk,
      semantic_error: semanticOk ? null : `expected tool ${fixture.expect?.tool_name}, got ${toolName}`,
    };
    rows.push(row);
    await writeFile(
      join(outDir, `${fixture.id}-${repetition}.response.json`),
      JSON.stringify(body, null, 2) + "\n",
    );
    console.log(JSON.stringify(row));
  }
}

await writeFile(join(outDir, "summary.jsonl"), rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
await writeFile(join(outDir, "run.json"), JSON.stringify({ url, quant, mtp_depth: mtpDepth, repetitions, corpus: basename(corpusDir), cases: fixtures.map((name) => basename(name, ".json")) }, null, 2) + "\n");
