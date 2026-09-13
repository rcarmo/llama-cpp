# Next agentic matrix controls

Complete the single already-prespecified CPU-only clamp control before changing prompts or tool semantics. Keep failed workflows and do not use repeated retries to select success.

## Tool-output variability

The baseline and candidate both reached the same syntax failure, but the model-visible Bun test output includes a measured duration (`[5.00ms]` versus `[6.00ms]`). This changes the following prompt and can alter greedy output. A control cannot attribute later text divergence to library arithmetic alone.

For the next frozen matrix, retain raw stdout/stderr and timings in evidence, but remove only volatile test durations (keep the pinned Bun version banner) from the model-visible tool response. Preserve exact compiler diagnostics, exit code, pass/fail counts, file paths and test outcomes. Test the normaliser with failed, passing, timeout and output-limit fixtures, and apply it identically to every arm. Do not edit historical traces. A report-only `tool-response.ts` plus tests is prepared but unrun and deliberately not wired into the current CPU-only diagnostic. It changes only a terminal `Ran N tests across N files. [duration]` field; ordinary diagnostic strings, errors, exit codes and pass/fail counts stay exact.

## Preserve factors

- Keep the same corrected native binary and record all native/runner/tool source hashes and loaded-library maps.
- Keep visible/hidden fixtures, schemas, prompt text, sampling, tool budget and token cap fixed once the matrix starts.
- Treat initial candidate, baseline and CPU-only failures as diagnostic attempts with their actual harness versions. They are not a matched performance sample.
- Measure successful repair and follow-up separately from exact tool-loop transport. Final source is independently graded even when the model never reports completion.
- After the CPU-only diagnosis, choose a bounded three-fixture matrix. Any revised prompts or edit-tool semantics constitute a new series, not a replacement of failed old cases.
- If the model cannot solve these tasks with the fixed tools, publish that limitation and continue kernel/stage qualification separately. Do not make model task success an excuse to discard a verified small kernel improvement, or call faster task failure an optimisation win.
