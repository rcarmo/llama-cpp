#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const here = resolve(import.meta.dir);
const repo = resolve(here, "../../..");
const skipModelHashes = process.argv.includes("--skip-model-hashes");
const staticValidation = Bun.spawnSync([process.execPath, join(here, "validate-static-evidence.ts")], { cwd: repo, stdout: "pipe", stderr: "pipe" });
if (staticValidation.exitCode !== 0) {
  process.stderr.write(staticValidation.stdout);
  process.stderr.write(staticValidation.stderr);
  process.exit(staticValidation.exitCode);
}
const failures: string[] = [];
const pass = (condition: unknown, message: string) => { if (!condition) failures.push(message); };
const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
function envFile(path: string): Record<string, string> {
  return Object.fromEntries(readFileSync(path, "utf8").split("\n").filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
    const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1)];
  }));
}
async function sha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

const manifest = json(join(here, "manifest.json"));
pass(manifest.source.commit === "78616cbadf8f6aa488f4913e98f1073c22f81017", "unexpected campaign source commit");
for (const model of ["maple", "gemma", "qwen"]) {
  const entry = manifest.models[model];
  pass(existsSync(entry.path), `${model} model missing`);
  if (!skipModelHashes) {
    pass(await sha256(entry.path) === entry.sha256, `${model} model hash mismatch`);
    if (entry.draft_path) pass(await sha256(entry.draft_path) === entry.draft_sha256, `${model} draft hash mismatch`);
  }
}

const api = json(join(here, "api/objective-summary.json"));
pass(api.models.maple.passed === 4 && api.models.gemma.passed === 4 && api.models.qwen.passed === 3, "API objective score mismatch");
const pi = json(join(here, "pi/objective-summary.json"));
pass(pi.models.qwen.passed === 4 && pi.models.maple.passed === 3 && pi.models.gemma.passed === 3, "Pi objective score mismatch");
const blind = json(join(here, "blind-review/result.json"));
pass(JSON.stringify(blind.overall_ranking_blind) === JSON.stringify(["C", "A", "B"]), "blind ranking mismatch");
for (const model of ["gemma", "maple", "qwen"]) {
  const piSummary = json(join(here, `pi/${model}/summary.json`));
  pass(piSummary.edit.passed, `Pi edit gate failed: ${model}`);
  pass(piSummary.instruction.passed, `Pi instruction gate failed: ${model}`);
  pass(piSummary.cancellation.recovered, `Pi cancellation gate failed: ${model}`);
  pass(readFileSync(join(here, `pi/${model}/edit-independent-test.exit-code`), "utf8").trim() === "0", `independent test exit mismatch: ${model}`);
}

const inventory = readFileSync(join(here, "weight-inventory-local.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
pass(inventory.length === 8, "local weight inventory count mismatch");
const accepted = inventory.find((x) => x.path.endsWith("maple-preview-tq2-exact-head.gguf"));
pass(accepted?.types?.TQ2_0 === 168 && accepted?.types?.F32 === 123, "accepted tensor inventory mismatch");

const parity = json(join(repo, "benchmarks/intel-1340p/maple-preview/compact/parity-native-tq2-2x2-2x1.json"));
pass(parity.routing.id_match_count === 2880 && parity.routing.id_count === 2880, "route parity gate failed");
pass(parity.final_hidden.nrmse < 1e-6, "hidden NRMSE gate failed");
pass(parity.logits.nrmse < 1e-6, "logit NRMSE gate failed");
const head = json(join(repo, "benchmarks/intel-1340p/maple-preview/compact/exact-head-vs-reference.json"));
pass(head.top1_matches === 15 && head.mean_top32_overlap === 32 && head.max_kl < 2e-11, "head parity gate failed");
pass(readFileSync(join(repo, "benchmarks/intel-1340p/maple-preview/final-hardening/result.txt"), "utf8").includes("focused_regressions=passed"), "focused regression marker missing");
const apiSmoke = json(join(repo, "benchmarks/intel-1340p/maple-preview/final-hardening/api-smoke-after-rebuild.json"));
pass(apiSmoke.choices?.[0]?.message?.content === "REBUILD_OK", "post-rebuild API smoke failed");
pass(readFileSync(join(repo, "benchmarks/intel-1340p/maple-preview/final-hardening/pi-smoke-after-rebuild.txt"), "utf8").includes("PI_REBUILD_OK"), "post-rebuild Pi smoke failed");

for (const model of ["gemma", "maple", "qwen"]) {
  const identityPath = join(here, `performance/${model}/run-identity.json`);
  pass(existsSync(identityPath), `missing performance identity: ${model}`);
  const identity = existsSync(identityPath) ? json(identityPath) : null;
  pass(identity?.source_commit === manifest.source.commit && identity?.server_sha256 === manifest.source.server_sha256, `performance source/build identity mismatch: ${model}`);
  pass(identity?.model_sha256 === manifest.models[model].sha256, `performance model identity mismatch: ${model}`);
  pass(identity?.observed?.model_api_id === manifest.models[model].id, `observed model API identity mismatch: ${model}`);
  pass(identity?.observed?.configured_slots === manifest.models[model].slots, `observed slot count mismatch: ${model}`);
  pass(identity?.observed?.context_per_slot === manifest.models[model].context_per_slot, `observed slot context mismatch: ${model}`);
  pass(identity?.observed?.server_executable_sha256 === manifest.source.server_sha256, `observed server executable mismatch: ${model}`);
  const command = readFileSync(join(here, `performance/${model}/server-command.txt`), "utf8");
  pass(command.includes(manifest.models[model].path), `observed command model path mismatch: ${model}`);
  pass(command.includes(`--threads ${manifest.host.threads}`), `observed command thread count mismatch: ${model}`);
  const installed = envFile(join(here, `performance/${model}/installed-profile.env`));
  const expected = manifest.models[model];
  pass(Number(installed.LLAMA_CTX) / Number(installed.LLAMA_PARALLEL ?? 1) === expected.context_per_slot, `installed context geometry mismatch: ${model}`);
  pass(Number(installed.LLAMA_PARALLEL ?? 1) === expected.slots, `installed parallel count mismatch: ${model}`);
  pass(installed.LLAMA_KV === expected.kv, `installed KV mismatch: ${model}`);
  pass(Number(installed.LLAMA_BATCH) === expected.batch && Number(installed.LLAMA_UBATCH) === expected.ubatch, `installed batch geometry mismatch: ${model}`);
  pass(Number(installed.LLAMA_MTP_DEPTH ?? 0) === expected.mtp_depth, `installed MTP depth mismatch: ${model}`);
  pass(Number(installed.LLAMA_CACHE_RAM_MIB) === expected.cache_ram_mib, `installed cache RAM mismatch: ${model}`);
  for (const target of ["512", "4096", "32768", "generation"]) {
    const path = join(here, `performance/${model}/response-${target}.json`);
    pass(existsSync(path) && readFileSync(path).length > 0, `missing performance response: ${model}/${target}`);
    const targetIdentityPath = join(here, `performance/${model}/${target}-identity.txt`);
    pass(existsSync(targetIdentityPath) && readFileSync(targetIdentityPath, "utf8").trim() === identity?.identity_sha256, `performance result identity mismatch: ${model}/${target}`);
    if (existsSync(path) && readFileSync(path).length > 0) {
      const response = json(path);
      pass(response.timings.prompt_n === (target === "generation" ? 512 : Number(target)), `prompt count mismatch: ${model}/${target}`);
      pass(response.timings.predicted_n === (target === "generation" ? 64 : 1), `generation count mismatch: ${model}/${target}`);
    }
  }
}
const piRender = Bun.spawnSync([process.execPath, join(here, "summarize-pi-suite.ts"), "--check"], { cwd: repo, stdout: "pipe", stderr: "pipe" });
pass(piRender.exitCode === 0, `Pi summary regeneration failed: ${piRender.stderr.toString().trim()}`);
const performanceRender = Bun.spawnSync([process.execPath, join(here, "summarize-matched-performance.ts"), join(here, "performance"), "--check"], { cwd: repo, stdout: "pipe", stderr: "pipe" });
pass(performanceRender.exitCode === 0, `performance summary regeneration failed: ${performanceRender.stderr.toString().trim()}`);
const reportRender = Bun.spawnSync([process.execPath, join(here, "render-report.ts"), "--check"], { cwd: repo, stdout: "pipe", stderr: "pipe" });
pass(reportRender.exitCode === 0, `report regeneration failed: ${reportRender.stderr.toString().trim()}`);
pass(existsSync(join(here, "performance/summary.json")) && readFileSync(join(here, "performance/summary.json")).length > 0, "performance summary missing");
pass(existsSync(join(here, "report.md")), "campaign report missing");

if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}
console.log("campaign validation passed");
