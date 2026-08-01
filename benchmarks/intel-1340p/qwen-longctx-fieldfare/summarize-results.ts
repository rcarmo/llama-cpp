#!/usr/bin/env bun

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = import.meta.dir;

async function json(path: string) {
  return JSON.parse(await readFile(join(root, path), "utf8"));
}

function row(group: string, name: string, data: any) {
  return {
    group,
    name,
    ctx: data.ctx ?? 131072,
    kv: data.kv ?? "q4_0",
    draft_depth: data.draft_depth ?? null,
    batch: data.batch ?? null,
    ubatch: data.ubatch ?? null,
    wall_seconds: data.wall_seconds,
    prompt_tokens: data.prompt_tokens,
    generated_tokens: data.generated_tokens,
    prompt_tps: data.prompt_tps,
    generation_tps: data.generation_tps,
    draft_tokens: data.draft_tokens,
    accepted_draft_tokens: data.accepted_draft_tokens,
    tool_name: data.tool_name,
  };
}

const rows: any[] = [];
for (const name of ["off", "bounded", "adaptive"]) rows.push(row("advice", name, await json(`gate/${name}/result.json`)));
for (const name of ["q5", "q8"]) rows.push(row("kv", name, await json(`kv-sweep/${name}/result.json`)));
rows.push(row("kv", "q4", await json("gate/off/result.json")));
for (const name of ["d0", "d1", "d2", "d3"]) rows.push(row("mtp", name, await json(`mtp-sweep/${name}/result.json`)));
for (const name of ["b1024-u256", "b2048-u512"]) rows.push(row("batch", name, await json(`batch-sweep/${name}/result.json`)));

await writeFile(join(root, "sweep-summary.json"), JSON.stringify(rows, null, 2) + "\n");

const lines = [
  "| Group | Profile | Context | KV | MTP | Batch | Ubatch | Wall s | Prompt tok/s | Generation tok/s | Accepted | Tool |",
  "|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---|",
];
for (const r of rows) {
  const accepted = r.draft_tokens ? `${r.accepted_draft_tokens}/${r.draft_tokens}` : "-";
  lines.push(`| ${r.group} | ${r.name} | ${r.ctx} | ${r.kv} | ${r.draft_depth ?? "-"} | ${r.batch ?? "-"} | ${r.ubatch ?? "-"} | ${r.wall_seconds.toFixed(3)} | ${r.prompt_tps.toFixed(3)} | ${r.generation_tps.toFixed(3)} | ${accepted} | ${r.tool_name} |`);
}
await writeFile(join(root, "sweep-summary.md"), lines.join("\n") + "\n");
console.log(lines.join("\n"));
