#!/usr/bin/env bun

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const here = resolve(import.meta.dir);
const repo = resolve(here, "../../..");
const failures: string[] = [];
const check = (condition: unknown, message: string) => { if (!condition) failures.push(message); };
const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));

const profileLines = readFileSync(join(repo, "benchmarks/intel-1340p/maple-preview/tuning/profile-final-pp64.err"), "utf8").split("\n");
const parseProfile = (name: string, kind?: string) => {
  const line = profileLines.find((value) => name === "total" ? value.includes("kind=total ") : value.includes(`name=${name} `) && (!kind || value.includes(`kind=${kind} `)));
  if (!line) throw new Error(`profile row missing: ${name}`);
  return Object.fromEntries([...line.matchAll(/(\w+)=([^ ]+)/g)].map((match) => [match[1], Number.isNaN(Number(match[2])) ? match[2] : Number(match[2])]));
};
const total = parseProfile("total");
const matrix = parseProfile("matrix", "family");
const dense = parseProfile("MUL_MAT", "op");
const routed = parseProfile("MUL_MAT_ID", "op");
const attention = parseProfile("attention", "family");
check(Math.abs(Number(matrix.wall_us) / Number(total.graph_us) - 0.9669) < 0.001, "matrix profile share mismatch");
check(Math.abs(Number(routed.wall_us) / Number(total.graph_us) - 0.7359) < 0.001, "routed profile share mismatch");
check(Math.abs(Number(dense.wall_us) / Number(total.graph_us) - 0.2310) < 0.001, "dense profile share mismatch");
check(Math.abs(Number(attention.wall_us) / Number(total.graph_us) - 0.0109) < 0.001, "attention profile share mismatch");
check(matrix.logical_read_bytes === 12915665408, "matrix logical read count mismatch");

const compact512 = json(join(repo, "benchmarks/intel-1340p/maple-preview/compact/pp512-native-tq2-2x2-2x1-serial.jsonl"));
const compactDecode = json(join(repo, "benchmarks/intel-1340p/maple-preview/compact/tg16-native-tq2-2x1-serial.jsonl"));
check(Math.abs(compact512.avg_ts - 75.605843) < 1e-6, "compact pp512 mismatch");
check(Math.abs(compactDecode.avg_ts - 20.956813) < 1e-6 && compactDecode.samples_ts.length === 3, "compact repeated decode mismatch");

const parity = json(join(repo, "benchmarks/intel-1340p/maple-preview/compact/parity-native-tq2-2x2-2x1.json"));
const head = json(join(repo, "benchmarks/intel-1340p/maple-preview/compact/exact-head-vs-reference.json"));
check(parity.routing.id_match_count === parity.routing.id_count && parity.routing.id_count === 2880, "route parity mismatch");
check(parity.final_hidden.nrmse < 1e-6 && parity.logits.nrmse < 1e-6, "state/logit parity mismatch");
check(head.top1_matches === head.token_count && head.mean_top32_overlap === 32 && head.max_kl < 2e-11, "head parity mismatch");

const local = readFileSync(join(here, "weight-inventory-local.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
const community = readFileSync(join(here, "weight-inventory-community-files.tsv"), "utf8").trim().split("\n");
check(local.length === 8, "local inventory count mismatch");
check(community.length === 74 && community.every((line) => line.split("\t").length === 4), "community object inventory mismatch");

if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}
console.log("static evidence validation passed");
