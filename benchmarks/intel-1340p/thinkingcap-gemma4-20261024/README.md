# ThinkingCap and five-model CPU comparison,24 October 2026

[Report](../../../docs/local/intel-i5-1340p/thinkingcap-gemma4-20261024.md): ThinkingCap coding 6/6,1,053 assertions; measured 8P-SMT decode gain about 4.5%. Nemotron was fastest in the five-model replay. Original 20 GiB and expanded 23.25 GiB groups are separate. New-model coding quality was not tested.

- [Results CSV](results.csv), [structured results](summary.json), [download manifest](models.json).
- [ThinkingCap coding](coding-thinkingcap.json), [historical Flint coding](coding-flint-historical.json).
- [Feature reuse](reuse.md), [retained source and logs](evidence.tar.gz), [publication checks](publication-checks.md).

## Reproduction

Use the physical workspace path and project-scoped build/cache/tmp defaults from the root AGENTS.md and Makefile. Do not put agent scratch in /tmp or a worktree-local cache. Inspect paths with`make agent-paths`. Models must be acquired separately at the manifest revisions and verified by size/SHA256. Preserve the stated quantisations.

The evidence archive contains the experimental v 2/expanded C++ harness, captured build/link commands, configuration/argv records, worker affinity, resource samples, native logs and result hashes. Rebuild against compatible fork headers/libraries in an isolated project build leaf. Captured scripts contain Sigma-specific absolute paths; inspect/adapt those paths before execution. The binaries used by the service are not replaced by an experimental build.

CPU replay environment:FLINT_THREADS=4, FLINT_BATCH_THREADS=16, MOE_CPU_MASK=0x 55, MOE_DECODE_STRICT=1, MOE_CONTEXT=4096, MOE_BATCH=512, FLINT_UBATCH=128, FLINT_FA=0, MOE_REPACK=0, FLINT_REPS=2, FLINT_PROMPT=512 or 2048, FLINT_DECODE=64. Invoke the harness with `MODEL cpu 0 bench` as separate arguments. The expanded harness admits Flint, Gemma 4, Qwen 35MoE, Nemotron-H-MoE. Each process warms its full workload before measurement and checks every vocabulary logit outside timed decode.

Run one native inference job at a time. Preserve current answers and completed trials. Freeze the new RAM ceiling only after unloading the previous model, subtract 2 GiB, require zero swap, and retain the whole-file+non-modelRSS guard. Do not replay captured campaign drivers against existing container names without inspecting persisted completion. The original coding suite is complete and must not be restarted.
