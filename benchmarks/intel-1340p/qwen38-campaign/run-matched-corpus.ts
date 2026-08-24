#!/usr/bin/env bun

import { mkdir, readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const url = (process.argv[2] ?? "http://127.0.0.1:8093").replace(/\/$/, "");
const model = process.argv[3] ?? "maple-preview-tq2-exact-head";
const label = process.argv[4] ?? "qwen38";
const outDir = resolve(process.argv[5] ?? `benchmarks/intel-1340p/qwen38-campaign/quality/${label}/api`);
const requestTimeoutMs = Number(process.env.REQUEST_TIMEOUT_MS ?? 1_800_000);
const originalCorpus = resolve("benchmarks/intel-1340p/qwen35moe-vulkan-mtp/corpus");
const extraCorpus = resolve(import.meta.dir, "../maple-preview/agentic");
await mkdir(outDir, { recursive: true });

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const files = [
  ...(await readdir(originalCorpus)).filter((file) => file.endsWith(".json")).map((file) => join(originalCorpus, file)),
  ...["instruction-following.json", "bounded-reasoning.json"].map((file) => join(extraCorpus, file)),
].sort((a, b) => basename(a).localeCompare(basename(b)));
const rows: Record<string, unknown>[] = [];

for (const file of files) {
  const fixture = await Bun.file(file).json() as any;
  const request = structuredClone(fixture.request);
  request.model = model;
  if (fixture.id === "bounded-reasoning") {
    request.reasoning_budget_tokens = 96;
    request.max_tokens = 192;
  } else if (fixture.expect?.tool_name || fixture.expect?.json) {
    request.reasoning_budget_tokens = 128;
    request.max_tokens = 256;
  } else {
    request.reasoning_budget_tokens = 256;
    request.max_tokens = 1024;
  }
  const responsePath = join(outDir, `${fixture.id}.response.json`);
  const existing = Bun.file(responsePath);
  let body: any;
  let wallMs = 0;
  let preserved = false;
  if (await existing.exists() && existing.size > 0) {
    body = await existing.json();
    preserved = true;
  } else {
    const started = performance.now();
    const process = Bun.spawn([
      "curl", "-fsS", "--max-time", String(Math.ceil(requestTimeoutMs / 1000)),
      "-H", "content-type: application/json", "--data-binary", "@-",
      `${url}/v1/chat/completions`,
    ], {
      stdin: new Blob([JSON.stringify(request)]),
      stdout: "pipe",
      stderr: "pipe",
    });
    const [text, errorText, exitCode] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
      process.exited,
    ]);
    wallMs = performance.now() - started;
    if (exitCode !== 0) throw new Error(`${fixture.id}: curl exit ${exitCode}: ${errorText.trim()}`);
    body = JSON.parse(text);
    await Bun.write(responsePath, `${JSON.stringify(body, null, 2)}\n`);
  }
  const choice = body.choices?.[0];
  const message = choice?.message ?? {};
  let semanticOk = true;
  let semanticError: string | null = null;
  try {
    if (fixture.expect?.tool_name) {
      assert(message.tool_calls?.length === 1, "expected exactly one tool call");
      assert(message.tool_calls[0].function?.name === fixture.expect.tool_name, `expected tool ${fixture.expect.tool_name}`);
      JSON.parse(message.tool_calls[0].function.arguments);
    }
    if (fixture.expect?.json) {
      const parsed = JSON.parse(message.content);
      assert(JSON.stringify(parsed) === JSON.stringify(fixture.expect.json), "structured output mismatch");
    }
    if (fixture.expect?.must_match) {
      const match = fixture.expect.must_match.match(/^\(\?i\)(.*)$/);
      const regex = new RegExp(match ? match[1] : fixture.expect.must_match, match ? "i" : "");
      assert(regex.test(message.content ?? ""), "required limitation language missing");
      assert(body.usage?.completion_tokens <= fixture.expect.max_completion_tokens, "reasoning budget exceeded");
      assert(choice?.finish_reason !== "length", "bounded reasoning exhausted token limit");
    }
    if (!fixture.expect?.tool_name && !fixture.expect?.json) {
      assert(String(message.content ?? "").trim().length > 0, "no visible answer produced");
      assert(choice?.finish_reason !== "length", "prose answer exhausted token limit");
    }
    assert(!String(message.content ?? "").includes("<think>"), "reasoning leaked into content");
  } catch (error: any) {
    semanticOk = false;
    semanticError = error.message;
  }
  const row = {
    case_id: fixture.id,
    label,
    model,
    wall_ms: wallMs,
    preserved,
    prompt_tokens: Number(body.timings?.prompt_n ?? body.usage?.prompt_tokens ?? 0),
    generated_tokens: Number(body.timings?.predicted_n ?? body.usage?.completion_tokens ?? 0),
    prompt_tps: Number(body.timings?.prompt_per_second ?? 0),
    generation_tps: Number(body.timings?.predicted_per_second ?? 0),
    reasoning_chars: String(message.reasoning_content ?? "").length,
    content_chars: String(message.content ?? "").length,
    finish_reason: choice?.finish_reason ?? null,
    tool_name: message.tool_calls?.[0]?.function?.name ?? null,
    semantic_ok: semanticOk,
    semantic_error: semanticError,
  };
  rows.push(row);
  console.log(JSON.stringify(row));
}

await Bun.write(join(outDir, "summary.json"), `${JSON.stringify(rows, null, 2)}\n`);
assert(rows.every((row) => row.semantic_ok), `${label}: one or more semantic cases failed`);
