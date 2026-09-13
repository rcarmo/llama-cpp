# Whole-file tool series (write-v2)

The old edit-v1 series is closed with failed candidate, baseline and CPU-only tasks. Preserve every trace. This series changes two harness factors together: bounded whole-file writes and stable model-visible test elapsed fields. Any quality change is attributed to the new interface series, not the inference library alone.

Keep model, native caller, MTP3, fixtures, hidden regressions and follow-up requirements unchanged. Keep ten total rounds and 512 output tokens per turn. Replace only the offered edit tool with `write_file(path, content)`, restricted to src/main.ts after both source and visible tests were read, max16KiB, no symlinks, no no-op writes, immutable tests. Store raw tool responses; normalise only the terminal test-duration field presented to the model. The revised system prompt explains the whole-file operation and asks for concise responses.

Run series only when CLI fourth argument and exact run-ID admission explicitly select `write-v2`; otherwise retain edit-v1. Record series, edit tool and all harness hashes in manifest/results. Legacy edit calls are not offered or executed in write-v2. Correct final source still requires independent initial and follow-up grades plus actual successful write/test use. Output exhaustion never authorises continuation.

First screen: one candidate clamp workflow, ID `writev2-clamp-candidate-pilot`, same <=600s16GiB/16MiBswap/6GiBreserve limits, initialGPU->CPU once then persistent MTP. This is not an authorised launch until both peers confirm that exact ID.

If the screen passes, use three fixtures and a prespecified baseline/candidate order with equivalent prompts/tool responses. Retain all failures, compare time to correct solution, and report cold/warm work separately. If it fails, stop this screen and investigate common native/MTP/tool semantics before adding retries. No prompt-specific supplied implementation or automatic benchmark-file repair.

Offline checks currently pass: 15 tests, 70 assertions covering legacy and opt-in writes, outcome classification and stable tool response. Native binary is unchanged; series-specific trained behaviour remains unqualified.
