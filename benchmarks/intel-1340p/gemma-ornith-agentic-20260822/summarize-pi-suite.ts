#!/usr/bin/env bun

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const [label, provider, model, outputArg] = process.argv.slice(2);
if (!label || !provider || !model || !outputArg) {
  throw new Error("usage: summarize-pi-suite.ts LABEL PROVIDER MODEL OUTPUT_DIR");
}
const out = resolve(outputArg);
const read = (name: string) => readFileSync(join(out, name), "utf8");
const integer = (name: string) => Number(read(name).trim());
const exists = (name: string) => Bun.file(join(out, name)).size > 0;

const retrievalOutput = read("retrieval.stdout");
const retrievalExit = integer("retrieval.exit-code");
const retrievalPassed = retrievalExit === 0
  && retrievalOutput.includes("tools/run-intel-candidate.sh")
  && retrievalOutput.includes("LLAMA_USE_MTP")
  && /target-only|disabled|use_mtp|MTP/i.test(retrievalOutput);

const editExit = integer("edit.exit-code");
const independentExit = integer("edit-independent-test.exit-code");
const diff = read("edit.diff");
const changedFiles = [...diff.matchAll(/^diff -ru .*?\/(src\/[^\t\n ]+) .*$/gm)].map((match) => match[1]);
const allowedDiff = changedFiles.length === 1
  && changedFiles[0] === "src/clamp.ts"
  && !diff.includes("clamp.test.ts")
  && !diff.includes("package.json");
const editPassed = editExit === 0 && independentExit === 0 && allowedDiff;

const instructionExit = integer("instruction.exit-code");
const instructionPassed = instructionExit === 0 && read("instruction.stdout").trim() === "GEMMA_ORNITH_AGENTIC_OK";
const cancellationExit = integer("cancellation.exit-code");
const recovered = exists("cancellation-recovery.txt") && read("cancellation-recovery.txt").trim() === "recovered=true";
const cancellationPassed = [124, 137, 143].includes(cancellationExit) && recovered;

const summary = {
  label,
  provider,
  model,
  retrieval: {
    exit_code: retrievalExit,
    wall_ms: integer("retrieval.wall-ms"),
    passed: retrievalPassed,
  },
  edit: {
    exit_code: editExit,
    wall_ms: integer("edit.wall-ms"),
    independent_test_exit_code: independentExit,
    changed_files: changedFiles,
    passed: editPassed,
  },
  instruction: {
    exit_code: instructionExit,
    wall_ms: integer("instruction.wall-ms"),
    passed: instructionPassed,
  },
  cancellation: {
    exit_code: cancellationExit,
    wall_ms: integer("cancellation.wall-ms"),
    server_recovered: recovered,
    passed: cancellationPassed,
  },
  passed: [retrievalPassed, editPassed, instructionPassed, cancellationPassed].filter(Boolean).length,
  total: 4,
};

await Bun.write(join(out, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
