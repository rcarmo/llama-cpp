# Whole-file tool pilot passes repair and follow-up

`writev2-clamp-candidate-pilot` passed both independent task phases using the retained native GPU-prefill/CPU-decode owner. The model fixed clamping with reversed bounds, then implemented the later NaN/RangeError requirement without restarting the process or handing the context back to the GPU.

| Measurement | Result |
|---|---:|
| Unit wall time | 57.562s |
| Model rounds | 10 (5 initial, 5 follow-up) |
| Tool calls | 4 reads, 2 writes, 2 visible test runs |
| Independent grade assertions | 7 initial, 10 follow-up, all pass |
| Generated tokens | 571 |
| Warm evaluated prompt tokens | 606 |
| Canonical replay tokens | 0 |
| MTP drafted / accepted | 537 / 392 |
| Initial handoff | 62.226ms |
| Initial shared / copied bytes | 181,403,648 / 0 |
| Peak unit memory / swap | 11.8GiB / 0 |
| Minimum available memory | 16,845,100KiB |
| Sampled competing processes | 0 |

`verify-agentic-run.ts` checks the retained guard samples, round/cache accounting, immutable test hash and independent grade files. The final artifact remains in the run directory. All native/tool workers and containers drained; services did not change and both peers were released.

This run changes the tool interface and prompt from edit-v1; it is not evidence of a kernel or handoff speedup over the old failed tasks. Whole-file writes and stable test-duration responses were introduced together. The earlier negative series is preserved. This one passed case qualifies the harness for a fixed next comparison; it does not establish a broad pass rate or long-context capacity.

Offline tests: 15 pass, 70 assertions. The native binary is unchanged from the renderer-qualified caller. Write-v2 is explicitly selected by series and admission; edit-v1 remains the default.
