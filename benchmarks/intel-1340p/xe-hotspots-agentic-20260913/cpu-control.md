# CPU-only control: ineffective edits and output exhaustion

`clamp-cpu-control` failed the same task without GPU prefill or KV handoff. It made no successful edit: two calls requested identical before/after text and another matched a malformed signature. Round six reached the 512-token cap while describing a correct clamping formula in prose. The independent final grade failed with expected 5, received 1.

The native process completed normally and the runner returned task-failure exit 2 (`output_budget_exhausted`). The shutdown-sampling correction produced no terminal false abort. Six rounds generated 822 tokens in 63.267s unit time; peak memory was 6.3GiB, all sampled/unit swap was zero, no competing processes were sampled, and minimum available memory was 22,147,528KiB. Services did not change. Native/tool workers and containers drained and both peers received the exact-ID release.

The backend loader still enumerated the installed Vulkan device, but model contexts used zero GPU layers, CPU operations and zero handoff bytes. This is CPU inference, not a claim that the Vulkan loader was absent.

| Diagnostic arm | Observed task result | Qualification limits |
|---|---|---|
| Batched handoff candidate | 10 rounds, round-budget failure; final source has nested export | Valid persistent execution, task failed |
| Pre-batching handoff baseline | 5 rounds, output cap; final source has nested export | Additional shutdown-sampling race; timing excluded |
| CPU-only target/MTP | 6 rounds, output cap; source unchanged and wrong | Valid execution, task failed |

All arms use the same native caller and MTP3. The failure is not specific to batching or GPU handoff, but these controls do not exclude a shared MTP, prompting or tool-interface issue. Timing differences include different generated work and model-visible test durations; there is no matched workflow speedup result.

Retain this negative series. A new series may test a simpler bounded whole-file tool and stable test-output formatting, but must declare that interface change, keep these failures, and run identical new contracts across all arms. Target-only decoding is another useful correctness control if MTP remains suspect. Kernel optimisations can be qualified independently while task success is unresolved.
