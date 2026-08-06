#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const here = resolve(import.meta.dir);
const model = process.argv[2];
if (!model) throw new Error("usage: build-performance-identity.ts MODEL");
const campaign = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));
const modelDir = join(here, `performance/${model}`);
const fixture = JSON.parse(readFileSync(join(modelDir, "fixtures/manifest.json"), "utf8"));
const modelApi = JSON.parse(readFileSync(join(modelDir, "models.json"), "utf8"));
const slots = JSON.parse(readFileSync(join(modelDir, "slots-before.json"), "utf8"));
const installedProfile = readFileSync(join(modelDir, "installed-profile.env"), "utf8");
const observedExecutable = readFileSync(join(modelDir, "server-executable.sha256"), "utf8").trim().split(/\s+/)[0];
const observedCommand = readFileSync(join(modelDir, "server-command.txt"), "utf8").trim();
const profile = campaign.models[model];
if (!profile) throw new Error(`unknown model ${model}`);
const identity = {
  model,
  source_commit: campaign.source.commit,
  build_commit: campaign.source.build_commit,
  build_number: campaign.source.build_number,
  server_sha256: campaign.source.server_sha256,
  model_id: profile.id,
  model_sha256: profile.sha256,
  draft_sha256: profile.draft_sha256 ?? null,
  profile: {
    context_per_slot: profile.context_per_slot,
    slots: profile.slots,
    kv: profile.kv,
    batch: profile.batch,
    ubatch: profile.ubatch,
    mtp_depth: profile.mtp_depth,
    cache_ram_mib: profile.cache_ram_mib,
  },
  fixture,
  observed: {
    model_api_sha256: createHash("sha256").update(JSON.stringify(modelApi)).digest("hex"),
    model_api_id: modelApi.data?.[0]?.id ?? null,
    configured_slots: slots.length,
    context_per_slot: slots[0]?.n_ctx ?? null,
    installed_profile_sha256: createHash("sha256").update(installedProfile).digest("hex"),
    server_executable_sha256: observedExecutable,
    server_command_sha256: createHash("sha256").update(observedCommand).digest("hex"),
  },
};
const canonical = JSON.stringify(identity);
const output = { ...identity, identity_sha256: createHash("sha256").update(canonical).digest("hex") };
await Bun.write(join(here, `performance/${model}/run-identity.json`), `${JSON.stringify(output, null, 2)}\n`);
console.log(output.identity_sha256);
