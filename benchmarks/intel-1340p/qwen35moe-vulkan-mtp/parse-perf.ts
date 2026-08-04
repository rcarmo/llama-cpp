#!/usr/bin/env bun

import { readFile } from "node:fs/promises";

const file = process.argv[2];
if (!file) throw new Error("usage: parse-perf.ts FILE [label]");
const label = process.argv[3] ?? "run";
const text = (await readFile(file, "utf8")).replace(/\x1b\[[0-9;]*m/g, "");
const re = /MUL_MAT\(type_a=(q[24]_K),type_b=f32,m=(\d+),n=(\d+),k=(\d+),[^)]*\):\s+\d+ runs -\s+([0-9.]+) us\/run -.*?-\s+([0-9.]+) GFLOPS/g;
let match: RegExpExecArray | null;
while ((match = re.exec(text))) {
  console.log(JSON.stringify({ label, type: match[1], m: Number(match[2]), n: Number(match[3]), k: Number(match[4]), us: Number(match[5]), gflops: Number(match[6]) }));
}
