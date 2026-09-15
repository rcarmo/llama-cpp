# Qwen3.8 and Qwen3.6 Dynamic comparison

This directory contains the complete 3 September 2026 Intel Core i5-1340P campaign for Qwen3.8 27B `UD-Q4_K_XL` and Qwen3.6 35B-A3B `UD-Q2_K_XL`.

Read [report.md](report.md) for the decision and measured results. Qwen3.6 was the preferred profile in this campaign. The [current Sigma service](../../../docs/local/intel-i5-1340p/gemma-local-provider-runbook.md) is Gemma zero-copy.

## Contents

- `manifest.json` records the host, runtime, model revisions, checksums and safety gates.
- `provenance/` contains model source records and snapshots of the relevant host service files.
- `fixtures/` contains the exact deterministic performance payloads.
- `results/` contains raw responses, telemetry, timings, diffs, summaries and preserved failure evidence.
- `state/` contains the top-level quality-run exit state.
- `run-*.sh` and `*.ts` contain the campaign harness.

The accepted matched performance results are under `results/qwen38/performance-4t/` and `results/qwen36/performance-4t/`. The accepted matched quality results are under each model's `quality-2t/` and `pi-2t/` directories.

Thermally invalid runs are retained under the directories named `thermal-fail` and under each model's `quality-4t/` directory. The harness stopped work after three consecutive one-second samples at or above 95 C.

Model weights are not stored in Git. The tested files remain in the adjacent workspace model directories, and `provenance/model-sources.tsv` binds each file to its source revision, byte size and SHA-256 digest.

The service snapshots record the host configuration available during the campaign. Benchmark commands were launched directly by the campaign scripts; each result directory records the exact server command used.
