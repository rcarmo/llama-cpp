# First long-agentic protocol: failed CPU attempt

The initial 1024-token-per-response protocol stopped before its first milestone. `long-cpu-0` performed four reads, then produced a prose/code response that exhausted its cap. Its artifact was never repaired; no copied/shared arm ran on this protocol. See [the failure report](first-protocol-result.md).

A separately frozen [v2 three-arm diagnostic](../xe-long-agentic-v2-20260914/README.md) applies tool-only code instructions and a 2048-token response cap to all arms, preserving the same fixture and total output budget. All v2 arms also fail completion; no successful-task speedup is established. Both protocols and their raw failures are retained.

The harness was qualified before inference: expected seed failure, all four visible and four hidden reference suites, nine sandbox guards, selective copied-KV control restoration and vocabulary-prefix checks pass. Private hidden/reference fixtures never enter model tool mounts.

`handoff-opportunities.md` records source-backed research options requested by Rui. Those ideas were not implemented in the comparison. No deployment, service changes or production-source changes.

This directory bundles source, fixture, one failed run and evidence hashes. It excludes models and compiled binaries. `verify-run.ts long-cpu-0` checks the failure's route/resources/metrics, not task success. Historical launch scripts require fresh admission and matching local assets; do not rerun them based on stored manifests.
