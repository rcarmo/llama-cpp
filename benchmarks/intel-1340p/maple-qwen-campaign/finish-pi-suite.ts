#!/usr/bin/env bun

import { resolve } from "node:path";

const label = process.argv[2] ?? "qwen";
const provider = process.argv[3] ?? "local-llama";
const model = process.argv[4] ?? "qwen3.6-35b-a3b-128k-mtp";
const endpoint = (process.argv[5] ?? "http://127.0.0.1:8090").replace(/\/$/, "");
const outDir = resolve(process.argv[6] ?? `benchmarks/intel-1340p/maple-qwen-campaign/pi/${label}`);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function runPi(name: string, timeoutSeconds: number, prompt: string): Promise<{ exitCode: number; wallMs: number }> {
  const started = performance.now();
  const proc = Bun.spawn(["timeout", String(timeoutSeconds), "pi", "-p", "--provider", provider, "--model", model, "--thinking", "low", "--no-session", "--tools", "", prompt], {
    cwd: "/var/home/agent/workspace/projects/llama-cpp",
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  const wallMs = performance.now() - started;
  await Bun.write(resolve(outDir, `${name}.stdout`), stdout);
  await Bun.write(resolve(outDir, `${name}.stderr`), stderr);
  await Bun.write(resolve(outDir, `${name}.exit-code`), `${exitCode}\n`);
  await Bun.write(resolve(outDir, `${name}.wall-ms`), `${Math.round(wallMs)}\n`);
  return { exitCode, wallMs };
}

const instruction = await runPi("instruction", 300, "Reply with exactly PI_TRIPLE_MODEL_OK and no other text.");
const instructionOut = await Bun.file(resolve(outDir, "instruction.stdout")).text();
assert(instruction.exitCode === 0, "instruction Pi run failed");
assert(instructionOut.trim() === "PI_TRIPLE_MODEL_OK", "instruction output mismatch");

const cancellation = await runPi("cancellation", 3, "Count upward indefinitely, one integer per line. Do not stop.");
assert([124, 137, 143].includes(cancellation.exitCode), "cancellation timeout did not fire");
let recovered = false;
for (let attempt = 0; attempt < 200; attempt++) {
  const response = await fetch(`${endpoint}/slots`);
  assert(response.ok, `slots returned ${response.status}`);
  const slots = await response.json() as any[];
  if (slots.every((slot) => !slot.is_processing)) {
    recovered = true;
    break;
  }
  await Bun.sleep(50);
}
assert(recovered, "server slot did not recover after cancellation");
await Bun.write(resolve(outDir, "cancellation-recovery.txt"), "recovered=true\n");
console.log(JSON.stringify({ label, instruction, cancellation, recovered }, null, 2));
