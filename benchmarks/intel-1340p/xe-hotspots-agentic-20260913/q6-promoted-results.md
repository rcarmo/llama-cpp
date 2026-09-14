# Promoted Q6 implementation passes the trained workflow

Commit `2f998c903d3255fa3330ab3265f8cae24c098050` adds the default-off `GGML_CPU_Q6_PAIR` helper/dispatcher and graph regression tests on `feat/xe-q6-integration`. The branch was pushed to the owner fork and its remote hash verified. Master and deployed services are unchanged.

## Qualification

- Fresh normal CMake CPU-only target build: 41 steps, then one registered `test-q6-pair` CTest.
- Native and non-AVX helper/dispatcher variants: 42 OFF/ON graph cases per variant, exact 5710 floats. Other retained backend objects were native; this was not a complete generic backend build.
- Normal CMake CTest retry: 42 OFF/ON cases, exact output SHA256 `c67cf18881a9276643408605b27bb9fa7d53c24b992f0b58eceee3692d97325b`. Cgroup peak 10,670,080 bytes, swap and memory events zero. Three throttled periods/290386 microseconds preclude timing interpretation.
- `q6-promoted-clamp-on`: 10 persistent rounds, repair and follow-up hidden grades both pass. Prompts/tools, raw output and work exactly match the retained predecessor `q6-clamp-on0`: 572 generated, 900 evaluated, 549 drafted and 389 accepted tokens.
- Loaded promoted CPU library SHA256 `6a24a46e33a5520c43ebdc086ac642e38d4e2526b906dc32d7a00ef52bf9c834`, matching the compile/test identity. `/proc` maps and implementation hashes are retained in the manifest.
- Trained unit: 57.669 seconds, 11.8 GiB peak, zero swap, minimum available host memory 16,584,424 KiB. No sampled competitors or service changes. GPU, CPU, MTP and tool workers/containers/render-device holders drained before release.

This trained run verifies promoted task behaviour. It is not a new matched timing comparison. The [predecessor ABBA](q6-agentic-results.md) remains the timing evidence: 1.20% lower whole-workflow and 1.57% lower warm native medians, two observations per arm on one task.

## Retained failures and limits

The first normal CTest launch stopped before execution because the image lacked `/usr/bin/time`; the retry used native cgroup counters. A promoted-run hash preflight used the wrong working directory and stopped before any unit/model launch; correcting the working directory verified all eight artifacts, then the single admitted trained run executed. Original evidence is retained.

A read-only judge delegate timed out after 150 seconds; this is not a review pass. Manual source review and passing tests support the checkpoint. Full backend test-suite, broader hardware/ISA coverage, combined timing and serving deployment are not established.
