#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { basename, resolve } from "node:path";

const [baseUrlArg, sourcePathArg, outDirArg, label] = process.argv.slice(2);
const targets = [512, 4096, 32768];

if (!baseUrlArg || !sourcePathArg || !outDirArg || !label) {
  throw new Error("usage: build-matched-prompts.ts BASE_URL SOURCE OUT_DIR LABEL");
}

const baseUrl = baseUrlArg;
const sourcePath = resolve(sourcePathArg);
const outDir = resolve(outDirArg);
const source = await Bun.file(sourcePath).text();

type Piece = { id: number; piece: string };

async function tokenize(text: string, withPieces = false): Promise<number | Piece[]> {
  const response = await fetch(`${baseUrl}/tokenize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: text, add_special: true, with_pieces: withPieces }),
  });
  if (!response.ok) throw new Error(`tokenize failed: ${response.status} ${await response.text()}`);
  const body = await response.json() as { tokens: number[] | Piece[] };
  return withPieces ? body.tokens as Piece[] : body.tokens.length;
}

const fullPieces = await tokenize(source, true) as Piece[];
const pieceText = fullPieces.map((token) => token.piece);
let leadingSpecials = 0;
let reconstructed = "";
while (leadingSpecials < pieceText.length && !source.startsWith(reconstructed + pieceText[leadingSpecials])) leadingSpecials++;
for (let i = leadingSpecials; i < pieceText.length; i++) reconstructed += pieceText[i];
const piecesReconstructSource = reconstructed === source;

async function exactPrefix(target: number): Promise<{ text: string; chars: number; tokens: number }> {
  const estimates = new Set<number>();
  if (piecesReconstructSource && target > leadingSpecials) {
    estimates.add(pieceText.slice(leadingSpecials, target).join("").length);
  }
  estimates.add(Math.round(source.length * target / fullPieces.length));

  let best = { chars: 0, tokens: 0, distance: Number.POSITIVE_INFINITY };
  for (const estimate of estimates) {
    for (let radius = 0; radius <= 4096; radius++) {
      const candidates = radius === 0 ? [estimate] : [estimate - radius, estimate + radius];
      for (const chars of candidates) {
        if (chars < 0 || chars > source.length) continue;
        const tokens = await tokenize(source.slice(0, chars)) as number;
        const distance = Math.abs(tokens - target);
        if (distance < best.distance) best = { chars, tokens, distance };
        if (tokens === target) return { text: source.slice(0, chars), chars, tokens };
      }
    }
  }
  throw new Error(`${label}: no exact ${target}-token prefix within verified piece boundaries; closest was ${best.tokens}`);
}

await mkdir(outDir, { recursive: true });
const sourceSha256 = createHash("sha256").update(source).digest("hex");
const prompts: unknown[] = [];
let generationPrompt = "";

for (const target of targets) {
  const prefix = await exactPrefix(target);
  if (target === 512) generationPrompt = prefix.text;
  const promptFile = `prompt-${target}.txt`;
  const payloadFile = `completion-${target}.json`;
  const payload = {
    prompt: prefix.text,
    n_predict: 1,
    temperature: 0,
    seed: 731,
    cache_prompt: false,
  };
  const payloadJson = `${JSON.stringify(payload)}\n`;
  await Bun.write(resolve(outDir, promptFile), prefix.text);
  await Bun.write(resolve(outDir, payloadFile), payloadJson);
  prompts.push({
    target_tokens: target,
    prompt_tokens: prefix.tokens,
    prompt_chars: prefix.chars,
    prompt_sha256: createHash("sha256").update(prefix.text).digest("hex"),
    payload_sha256: createHash("sha256").update(payloadJson).digest("hex"),
    prompt_file: promptFile,
    payload_file: payloadFile,
  });
}

const generationPayload = {
  prompt: generationPrompt,
  n_predict: 64,
  temperature: 0,
  seed: 731,
  cache_prompt: false,
  ignore_eos: true,
};
const generationPayloadJson = `${JSON.stringify(generationPayload)}\n`;
await Bun.write(resolve(outDir, "completion-generation.json"), generationPayloadJson);

const manifest = {
  label,
  tokenizer_endpoint: baseUrl,
  source: basename(sourcePath),
  source_sha256: sourceSha256,
  source_chars: source.length,
  add_special: true,
  prompts,
  generation: {
    prompt_tokens: 512,
    generated_tokens: 64,
    payload_sha256: createHash("sha256").update(generationPayloadJson).digest("hex"),
    payload_file: "completion-generation.json",
  },
};
await Bun.write(resolve(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest));
