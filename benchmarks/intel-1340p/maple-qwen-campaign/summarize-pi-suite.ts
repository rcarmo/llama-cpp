#!/usr/bin/env bun

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const here = resolve(import.meta.dir);
const allLabels = ["maple", "gemma", "qwen"];
const checkMode = process.argv.includes("--check");
const selected = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const labels = selected.length ? selected : allLabels;
const identities: Record<string, { provider: string; model: string }> = {
  maple: { provider: "local-maple", model: "maple-preview-tq2-exact-head" },
  gemma: { provider: "local-gemma", model: "gemma-4-e4b-qat-mtp" },
  qwen: { provider: "local-llama", model: "qwen3.6-35b-a3b-128k-mtp" },
};
const assert = (condition: unknown, message: string): asserts condition => { if (!condition) throw new Error(message); };
const read = (label: string, name: string) => readFileSync(join(here, "pi", label, name), "utf8");
const integer = (label: string, name: string) => Number(read(label, name).trim());

for (const label of labels) {
  const retrievalOutput = read(label, "retrieval.stdout");
  const retrievalExit = integer(label, "retrieval.exit-code");
  const retrievalPassed = retrievalExit === 0 && retrievalOutput.includes("src/llama-kv-cache.cpp") && retrievalOutput.includes("get_can_shift") && /per-layer|RoPE|rope/.test(retrievalOutput);
  let retrievalFailure: string | undefined;
  if (!retrievalPassed && retrievalExit === 124) {
    const journalPath = join(here, "pi", label, "retrieval-server-journal.txt");
    const journal = Bun.file(journalPath).size > 0 ? readFileSync(journalPath, "utf8") : "";
    const orphaned = journal.includes("cancel task, id_task = 605") && journal.includes("cancel task, id_task = 615") && journal.includes("Stopped llama-maple-local-provider.service");
    retrievalFailure = orphaned ? "client timeout; server slot remained busy until service restart" : "client timeout";
  } else if (!retrievalPassed) {
    const reportedPath = retrievalOutput.match(/Source Path:\*\* `([^`]+)`/)?.[1] ?? retrievalOutput.match(/`(src\/[^`]+)`/)?.[1] ?? "unknown";
    const reportedFunction = retrievalOutput.match(/Function Name:\*\* `([^`]+)`/)?.[1] ?? retrievalOutput.match(/`(llama_[^`]+)`/)?.[1] ?? "unknown";
    retrievalFailure = `reported ${reportedPath} and ${reportedFunction} instead of explicit disable site`;
  }

  const editExit = integer(label, "edit.exit-code");
  const independentExit = integer(label, "edit-independent-test.exit-code");
  const diff = read(label, "edit.diff");
  const changedFiles = [...diff.matchAll(/^diff -ru .*?\/(src\/[^\t\n ]+) .*$/gm)].map((match) => match[1]);
  const allowedDiff = changedFiles.length === 1 && changedFiles[0] === "src/clamp.ts" && !diff.includes("clamp.test.ts") && !diff.includes("package.json");
  const validClamp = /return (Math\.min\(max, Math\.max\(min, value\)\)|Math\.max\(min, Math\.min\(value, max\)\));/.test(diff);

  const instructionOutput = read(label, "instruction.stdout").trim();
  const instructionExit = integer(label, "instruction.exit-code");
  const cancellationExit = integer(label, "cancellation.exit-code");
  const recovered = read(label, "cancellation-recovery.txt").trim() === "recovered=true";

  const summary = {
    label,
    ...identities[label],
    retrieval: {
      exit_code: retrievalExit,
      wall_ms: integer(label, "retrieval.wall-ms"),
      passed: retrievalPassed,
      ...(retrievalFailure ? { failure: retrievalFailure } : {}),
    },
    edit: {
      exit_code: editExit,
      wall_ms: integer(label, "edit.wall-ms"),
      passed: editExit === 0 && independentExit === 0 && allowedDiff && validClamp,
    },
    instruction: {
      exit_code: instructionExit,
      wall_ms: integer(label, "instruction.wall-ms"),
      passed: instructionExit === 0 && instructionOutput === "PI_TRIPLE_MODEL_OK",
    },
    cancellation: {
      exit_code: cancellationExit,
      wall_ms: integer(label, "cancellation.wall-ms"),
      recovered: [124, 137, 143].includes(cancellationExit) && recovered,
    },
  };
  const summaryPath = join(here, "pi", label, "summary.json");
  const rendered = `${JSON.stringify(summary, null, 2)}\n`;
  if (checkMode) assert(readFileSync(summaryPath, "utf8") === rendered, `summary mismatch: ${label}`);
  else await Bun.write(summaryPath, rendered);
}

if (labels.length !== allLabels.length) process.exit(0);
const summaries = Object.fromEntries(allLabels.map((label) => [label, JSON.parse(read(label, "summary.json"))]));
const objective = {
  tasks: ["repository retrieval", "constrained code edit", "exact instruction", "cancellation recovery"],
  models: Object.fromEntries(labels.map((label) => {
    const s = summaries[label];
    const passed = Number(s.retrieval.passed) + Number(s.edit.passed) + Number(s.instruction.passed) + Number(s.cancellation.recovered);
    const diff = read(label, "edit.diff");
    const changedFiles = [...diff.matchAll(/^diff -ru .*?\/(src\/[^\t\n ]+) .*$/gm)].map((match) => match[1]);
    const diffMinimal = changedFiles.length === 1 && changedFiles[0] === "src/clamp.ts" && !diff.includes("clamp.test.ts") && !diff.includes("package.json");
    return [label, { passed, failed: 4 - passed, retrieval: s.retrieval, edit: { passed: s.edit.passed, wall_ms: s.edit.wall_ms, independent_test: integer(label, "edit-independent-test.exit-code") === 0, diff_minimal: diffMinimal }, instruction: s.instruction, cancellation: { passed: s.cancellation.recovered, client_exit_code: s.cancellation.exit_code, server_recovered: s.cancellation.recovered } }];
  })),
  notes: [] as string[],
};
const retrievalWinners = allLabels.filter((label) => objective.models[label].retrieval.passed);
objective.notes.push(`${retrievalWinners.map((label) => label[0].toUpperCase() + label.slice(1)).join(" and ")} ${retrievalWinners.length === 1 ? "was" : "were"} the only model${retrievalWinners.length === 1 ? "" : "s"} to retrieve the explicit disable site correctly.`);
if (allLabels.every((label) => objective.models[label].edit.independent_test && objective.models[label].edit.diff_minimal)) objective.notes.push("All code edits changed only src/clamp.ts and passed an independent bun test.");
const editFastest = allLabels.reduce((best, label) => objective.models[label].edit.wall_ms < objective.models[best].edit.wall_ms ? label : best, allLabels[0]);
const instructionFastest = allLabels.reduce((best, label) => objective.models[label].instruction.wall_ms < objective.models[best].instruction.wall_ms ? label : best, allLabels[0]);
if (editFastest === instructionFastest) objective.notes.push(`${editFastest[0].toUpperCase()}${editFastest.slice(1)} was fastest on the isolated edit and exact-reply tasks.`);
const slowestAll = allLabels.find((label) => allLabels.every((other) => objective.models[label].retrieval.wall_ms >= objective.models[other].retrieval.wall_ms && objective.models[label].edit.wall_ms >= objective.models[other].edit.wall_ms && objective.models[label].instruction.wall_ms >= objective.models[other].instruction.wall_ms));
if (slowestAll) objective.notes.push(`${slowestAll[0].toUpperCase()}${slowestAll.slice(1)} was slowest on all real Pi tasks.`);
const objectivePath = join(here, "pi", "objective-summary.json");
const renderedObjective = `${JSON.stringify(objective, null, 2)}\n`;
if (checkMode) assert(readFileSync(objectivePath, "utf8") === renderedObjective, "objective summary mismatch");
else await Bun.write(objectivePath, renderedObjective);
process.stdout.write(renderedObjective);
