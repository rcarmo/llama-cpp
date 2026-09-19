# External Qwen3.8 Q4 MTP compatibility screen

This CPU-only screen tests the local Qwen3.8 Q4 MTP sidecar against Bonsai 2 27B PTQ1. It establishes runtime compatibility but rejects the sidecar as a performance candidate.

## Models and source

- Target: `Ternary-Bonsai-2-27B-PTQ1_0.gguf`.
- Draft: `mtp-Qwen3.8-27B-Q4_0.gguf`.
- Host: LattePanda Sigma, Intel Core i5-1340P, 12 runtime threads.
- Target and draft: CPU, 512-token context, batch/uBatch 128, greedy sampling and seed 42.
- Source and binary hashes are in `source-commit.txt` and `binary.sha256`; model hashes are in `models.sha256`.

The common speculative constructor previously logged the external draft path but loaded the target path. `common/speculative.cpp` now loads `model_path` for an external draft. This also removes the false requirement that Bonsai contain embedded `nextn` tensors.

## Compatibility and performance

The Qwen3.8 sidecar loaded as a separate MTP model, matched the target output width and tokenizer, initialized an MTP context, produced finite output and exercised partial rejection/checkpoint rollback. Draft depths 1-3 completed twice on each fixture.

| Fixture | Arm | Acceptance | Decode tok/s | Change from control |
|---|---|---:|---:|---:|
| capital, 17 predicted | control | n/a | 1.294-1.298 | control |
| capital, depth 1 | 8/9 (88.9%) | 1.100-1.102 | -15.1% |
| capital, depth 2 | 10/14 (71.4%) | 1.011-1.017 | -21.6% |
| capital, depth 3 | 10/20 (50.0%) | 0.811-0.815 | -37.3% |
| integers, 9-11 predicted | control | n/a | 1.289-1.290 | control |
| integers, depth 1 | 5/5 (100%) | 1.161-1.163 | not comparable token count; slower |
| integers, depth 2 | 7/7 (100%) | 1.226-1.233 | not comparable token count; slower |
| integers, depth 3 | 8/9 (88.9%) | 1.189-1.194 | not comparable token count; slower |

`results.tsv` retains every parsed observation. The capital fixture has fixed predicted work and is the decision fixture. Even depth 1 lost about 15%, and larger drafts lost more as acceptance fell. The external sidecar is therefore compatible but rejected for Bonsai performance.

This was CPU-only work. The primary Gemma service remained active and recorded zero restarts and zero swap.
