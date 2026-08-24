#!/usr/bin/env bun

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const count = Number(process.argv[2] ?? "4700");
if (!Number.isInteger(count) || count < 100) throw new Error("entry count must be >= 100");
const outDir = join(import.meta.dir, "workloads");
await mkdir(outDir, { recursive: true });

const entries: string[] = [];
for (let i = 0; i < count; i++) {
  const area = ["common", "ggml-cpu", "ggml-vulkan", "server", "tests", "tools"][i % 6];
  const ext = i % 5 === 0 ? "h" : i % 3 === 0 ? "glsl" : "cpp";
  entries.push(`${String(i).padStart(5, "0")} src/${area}/module-${String(i).padStart(5, "0")}.${ext} owner=backend-${i % 17} status=${i % 13 === 0 ? "experimental" : "stable"} checksum=${((i * 2654435761) >>> 0).toString(16).padStart(8, "0")}`);
}
const needle = Math.max(0, count - 80);
entries.splice(needle, 0,
  "NEEDLE ggml/src/ggml-cpu/whole-token-profile.cpp owns routed MUL_MAT_ID expert residency, bounded mmap range planning, and async MADV_WILLNEED submission",
  "RELATED ggml/src/ggml-cpu/expert-io-plan.cpp coalesces selected expert address ranges under byte and range budgets",
  "RELATED tools/server/server-context.cpp exports expert I/O counters through the Prometheus metrics endpoint",
);

const request = {
  messages: [
    {
      role: "system",
      content: "You are a coding agent. Repository evidence must be obtained with the supplied search_repository tool. Do not answer from memory.",
    },
    {
      role: "user",
      content: `The following generated repository manifest is intentionally long. Find the implementation that observes Qwen routed-expert page residency and submits bounded asynchronous mmap advice. Use search_repository with a narrow query and path. Do not modify anything. The decisive records are near the end.\n\n${entries.join("\n")}`,
    },
  ],
  tools: [
    {
      type: "function",
      function: {
        name: "search_repository",
        description: "Search repository source files for a symbol or phrase.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string" },
            path: { type: "string" },
            max_results: { type: "integer", minimum: 1, maximum: 20 },
          },
          required: ["query", "path", "max_results"],
          additionalProperties: false,
        },
      },
    },
  ],
  tool_choice: "required",
  parallel_tool_calls: false,
  max_tokens: 384,
  temperature: 0,
  seed: 731,
  stream: false,
  chat_template_kwargs: { enable_thinking: false },
};

const path = join(outDir, `agentic-retrieval-${count}.json`);
await writeFile(path, JSON.stringify(request) + "\n");
console.log(path);
