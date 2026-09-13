# Six-run agentic screen: no workflow speedup established

Baseline and allocation-batched candidate produce identical prompts and generated work for all three task pairs. Clamp and median pass repair and follow-up in both arms. Defaults reaches the ten-round limit in both arms: its final code independently passes all requirements, but the agent does not finish the required follow-up test/report cycle. The protocol therefore records two incomplete workflows rather than promoting the post-run grade to success.

| Task | Arm | Workflow | Final artifact | Runner wall s | Handoff ms | Generated | Evaluated prompt |
|---|---|---|---|---:|---:|---:|---:|
| clamp | baseline | pass | pass | 57.539 | 75.070 | 572 | 900 |
| clamp | candidate | pass | pass | 58.367 | 66.240 | 572 | 900 |
| median | candidate | pass | pass | 62.183 | 67.933 | 587 | 1026 |
| median | baseline | pass | pass | 61.562 | 66.741 | 587 | 1026 |
| defaults | baseline | round limit | pass | 55.805 | 68.024 | 497 | 1055 |
| defaults | candidate | round limit | pass | 56.131 | 62.336 | 497 | 1055 |

The candidate's whole-workflow times are 1.44% slower for clamp and 1.01% slower for median in these single pairs. Handoff differences are -8.83ms, +1.19ms and -5.69ms respectively. These observations do not establish an overall speedup or a reliable regression. No extra repetitions were selected to obtain a favourable result.

Allocation batching remains a verified mechanism: one view per allocation, native continuation/lifetime tests pass, and each trained initial handoff reports181,403,648 shared bytes with zero copied bytes. The much larger repeated-visibility stall in the earlier diagnostic profile does not recur consistently in these short unprofiled workflows. Keep the small possible cold-stage savings for combined confirmation; do not extrapolate the synthetic view timing or discard the mechanism solely because this screen is noisy.

## Controls and coverage

- Frozen six-run order, three independent fixtures, baseline/candidate order reversed for median; one persistent native process per workflow.
- Same native binary and model/assistant; only loaded `libllama` changes between arms. All seven frozen harness-source hashes match manifests.
- Complete model-visible message/tool-schema hashes match for every paired round; generated raw text, token/evaluation counts and final source hashes also match.
- Ten rounds x512 output cap, real read/write/test tools and independent hidden initial/follow-up tests. Raw tool logs retained; only fixture-test elapsed fields normalised before showing them to the model.
- All six runs: services unchanged, no sampled competitors, zero swap, minimum host reserve above6GiB. Owned processes and tool containers drained; exact-ID releases sent after each run.
- 18 offline tests/91 assertions pass. `verify-agentic-run.ts` checks retained per-run invariants; `compare-write-v2.ts` validates frozen identities and computes the matrix.

This is a balanced-order screen, not a confidence interval, broad coding benchmark or long-context qualification. The earlier failed edit-v1 series and the passed write-v2 pilot remain separate. No production deployment occurred. Next is monitored Q4 eight-thread confirmation, then Q6_K/Vulkan work and an actual combined candidate comparison.
