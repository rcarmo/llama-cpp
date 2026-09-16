#!/usr/bin/env bun
/** SCRIPT_JDOC:
{"summary":"Assess and sandbox frozen unspecified-sampling Gemma coding outputs after model shutdown","kind":"mixed","weight":"standard","role":"entrypoint"}
*/
import {mkdirSync, writeFileSync} from 'node:fs';
import {assessSubmittedModule, normaliseTagsFixture} from '../gemma-optimization-t02-20260911/fixtures';
import {sandbox} from '../gemma-optimization-t02-20260911/sandbox';

const campaign = import.meta.dir;
const source = `${campaign}/unspecified-sampling/runs`;
const evaluation = `${campaign}/unspecified-sampling/evaluation`;
mkdirSync(evaluation, {recursive: true});
const rows: Record<string, unknown>[] = [];

for (const arm of ['live', 'candidate']) {
  for (const seed of normaliseTagsFixture.seeds) {
    const name = `${arm}-${seed}`;
    const response = await Bun.file(`${source}/${name}/response.json`).json() as any;
    const text = String(response.choices?.[0]?.message?.content ?? '');
    const assessment = assessSubmittedModule(text, normaliseTagsFixture.exportName);
    const row: Record<string, unknown> = {
      arm,
      seed,
      content_sha256: new Bun.CryptoHasher('sha256').update(text).digest('hex'),
      assessment: {ok: assessment.ok, errors: assessment.errors},
      usage: response.usage,
      zero_copy: response.zero_copy,
    };
    if (assessment.ok) {
      row.sandbox = await sandbox(
        `${evaluation}/${name}`,
        assessment.source,
        normaliseTagsFixture.validatorSource,
        `gemma-t02-parity-${arm}-${seed}`,
      );
    } else {
      row.sandbox = {pass: false, skipped: true, reason: 'static assessment failed'};
    }
    rows.push(row);
  }
}

const result = {
  fixture: normaliseTagsFixture.id,
  prompt_sha256: new Bun.CryptoHasher('sha256').update(normaliseTagsFixture.prompt).digest('hex'),
  request_sampling: 'model defaults; seed and max_tokens only',
  model_processes_stopped_before_evaluation: true,
  rows,
};
writeFileSync(`${campaign}/unspecified-sampling/results.json`, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
