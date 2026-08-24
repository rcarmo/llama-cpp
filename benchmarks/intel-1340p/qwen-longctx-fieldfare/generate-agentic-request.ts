#!/usr/bin/env bun

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const outDir = join(import.meta.dir, "workloads");
await mkdir(outDir, { recursive: true });

const entries: string[] = [];
for (let i = 0; i < 120; i++) {
  const area = ["common", "ggml-cpu", "ggml-vulkan", "server", "tests", "tools"][i % 6];
  const ext = i % 5 === 0 ? "h" : i % 3 === 0 ? "glsl" : "cpp";
  entries.push(`${String(i).padStart(3, "0")} src/${area}/module-${String(i).padStart(3, "0")}.${ext} owner=backend-${i % 9} status=${i % 11 === 0 ? "experimental" : "stable"}`);
}
entries.splice(87, 0, "NEEDLE ggml/src/ggml-cpu/whole-token-profile.cpp owns routed MUL_MAT_ID expert residency, bounded mmap range planning, and async MADV_WILLNEED submission");
entries.splice(88, 0, "RELATED ggml/src/ggml-cpu/expert-io-plan.cpp coalesces selected expert address ranges under byte and range budgets");
entries.splice(89, 0, "RELATED tools/server/server-context.cpp exports expert I/O counters through the Prometheus metrics endpoint");

const request = {
  messages: [
    {
      role: "system",
      content: "You are a coding agent. Repository evidence must be obtained with the supplied search_repository tool. Do not answer from memory.",
    },
    {
      role: "user",
      content: `The following generated repository manifest is intentionally long. Find the implementation that observes Qwen routed-expert page residency and submits bounded asynchronous mmap advice. Use search_repository with a narrow query and path, then report the first three files to inspect. Do not modify anything.\n\n${entries.join("\n")}`,
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

await writeFile(join(outDir, "agentic-tool-planning-3k.json"), JSON.stringify(request, null, 2) + "\n");
console.log(join(outDir, "agentic-tool-planning-3k.json"));
