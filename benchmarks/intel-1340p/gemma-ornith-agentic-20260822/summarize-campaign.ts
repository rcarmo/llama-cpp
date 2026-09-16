#!/usr/bin/env bun

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.argv[2] ?? import.meta.dir);
const labels = ["ornith", "gemma"];
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));

function telemetry(label: string) {
  const lines = readFileSync(join(root, "results", label, "telemetry.tsv"), "utf8").trim().split("\n").slice(1);
  const rows = lines.map((line) => {
    const [epoch, phase, rss, pss, swap, mem, swapFree, temp] = line.split("\t");
    return { epoch: Number(epoch), phase, rss: Number(rss), pss: Number(pss), swap: Number(swap), mem: Number(mem), swapFree: Number(swapFree), temp: Number(temp) };
  });
  return {
    samples: rows.length,
    peak_rss_kib: Math.max(...rows.map((row) => row.rss)),
    peak_pss_kib: Math.max(...rows.map((row) => row.pss)),
    peak_process_swap_kib: Math.max(...rows.map((row) => row.swap)),
    minimum_mem_available_kib: Math.min(...rows.map((row) => row.mem)),
    minimum_swap_free_kib: Math.min(...rows.map((row) => row.swapFree)),
    maximum_package_temp_mC: Math.max(...rows.map((row) => row.temp)),
    maximum_workload_package_temp_mC: Math.max(...rows.filter((row) => row.phase === "api" || row.phase === "pi").map((row) => row.temp)),
  };
}

const models = Object.fromEntries(labels.map((label) => {
  const base = join(root, "results", label);
  const api = readJson(join(base, "api", "summary.json"));
  const pi = readJson(join(base, "pi", "summary.json"));
  const apiPassed = api.filter((row: any) => row.semantic_ok).length;
  const apiWallMs = api.reduce((sum: number, row: any) => sum + Number(row.wall_ms), 0);
  const piWallMs = [pi.retrieval, pi.edit, pi.instruction, pi.cancellation].reduce((sum, task) => sum + Number(task.wall_ms), 0);
  return [label, {
    api: { passed: apiPassed, total: api.length, wall_ms: apiWallMs, cases: api },
    pi: { passed: pi.passed, total: pi.total, wall_ms: piWallMs, tasks: pi },
    combined: { passed: apiPassed + pi.passed, total: api.length + pi.total, wall_ms: apiWallMs + piWallMs },
    resources: telemetry(label),
  }];
}));

const summary = {
  date: "2026-08-22",
  workload: {
    api_cases: ["bounded reasoning", "cached follow-up", "implementation diagnosis", "instruction following", "repository planning", "required tool planning"],
    pi_tasks: ["repository retrieval", "constrained code repair", "exact instruction", "cancellation recovery"],
    thermal_gate_mC: 95000,
  },
  models,
};
await Bun.write(join(root, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
