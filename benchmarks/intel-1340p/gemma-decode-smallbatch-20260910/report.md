# Small Gemma target batches:16.52% faster64K decode, deployed

> Historical deployment snapshot (10-11 September 2026). The [15 September in-process zero-copy service](../gemma-zero-copy-service-20260915/README.md) supersedes the service identity, ports, active flags and rollback targets below. Commands in this snapshot are not current operating procedures.

Selecting the8-thread decode pool for CPU Gemma target batches of at most four tokens improved median64K generation from **7.3035 to8.5099 tok/s (+16.52%)** across eight counterbalanced runs. Request time fell **13.48%**. Large prefill still uses16 threads; the assistant is unchanged.

The qualified candidate is deployed on the existing hybrid8091 endpoint in immutable release `20260910-smallbatch`. Final smoke passed at22:56:31UTC on10September2026: supervisor639650, CPU639670, no restarts, zero CPU swap. GPU prefill remains the previously deployed FP32/256 configuration.

## Why this change

Saved64K profiling found MTP target verification cost16.46 seconds versus1.72 seconds drafting. Four-row MTP3 verification selected the target's16-thread batch pool. A separate uninstrumented configuration screen, changing target batch threads only, showed20.80% higher decode throughput with8. That screen identified the opportunity; it is not the result claimed for this code patch.

A global batch-thread reduction would undo the validated large-prefill16-thread setting. The code therefore changes the call to `graph_compute` only when all conditions hold:

- `LLAMA_EXPERIMENTAL_SMALL_TARGET_BATCH=1`, read once at process startup;
- target architecture is `LLM_ARCH_GEMMA4`, excluding its assistant;
- zero GPU layers;
- microbatch contains at most four tokens.

The call uses the existing decode thread count and pool. Larger batches retain the existing batch path. This affects all small target batches, including tiny prompt/append batches; it is not an explicit speculative-phase flag. Other models, GPU placement and assistant batches are excluded. With a different MTP depth or thread topology, applicability needs re-evaluation.

## Exact source and runtime

`patch/small-target-batch.patch` applies to `src/llama-context.cpp` at retained revision `abdbeadfb`. Headers were reconstructed from that revision. Only the context object was compiled; `libllama` was relinked against the retained objects. No public header or ABI changed, and no production binary was overwritten in place.

Measured and deployed `libllama` SHA-256:

```
35289adccdf6965d3d7eb7ade2271723b1169e65772bf849c8a5431288d0aec9
```

Controls and candidates used the same isolated runtime with the opt-in flag absent/present. The executable still reports `b10579-abdbeadfb`; the library hash, patch and build records identify the change. Production inserts the candidate library directory before the retained CPU libraries and pins the actual mapped file's hash. All other CPU/GPU runtime files remain unchanged.

## Counterbalanced native results

Fixed: CPU8/prefill16, draft8/batch16, MTP3, F16 KV, FA off, compact SWA, two128K slots. Every run restored identical retained64K state, reused64658 tokens, evaluated25 and generated128. Every run accepted90 of110 drafts and recalled all three keys. Exact output tokens matched, but parity was diagnostic rather than an acceptance gate.

| Order | Flag | Decode | Request wall |
|---|---|---:|---:|
|0 |off |7.305 tok/s |19.344 s |
|1 |on |8.499 tok/s |16.692 s |
|2 |on |8.462 tok/s |16.723 s |
|3 |off |7.314 tok/s |19.278 s |
|4 |on |8.521 tok/s |16.801 s |
|5 |off |7.096 tok/s |19.743 s |
|6 |off |7.302 tok/s |19.208 s |
|7 |on |8.582 tok/s |16.580 s |

Medians over four observations per profile:7.3035 versus8.5099tok/s, a16.52% gain. The request measure includes the25-token tail and generation, but excludes worker startup and restore. No profiler was enabled in these timings. One counting/recall task does not establish broad coding quality or a global decode optimum.

## Large-prefill and lifecycle checks

One target-only4K prefill pair with256-token microbatches took66.832 seconds off and66.403 seconds on. Both evaluated4096 tokens, generated one and produced the same token. The0.64% temporal difference is a non-regression check, not a prefill-speed claim. The source condition leaves every256-row prompt batch on the16-thread path.

A separate candidate lifecycle run passed:

-64663-token recall with64662 cached and one evaluated;
- saved KV scan with zero NaN/Inf, complete parser consumption and both Gemma caches;
- actual tool call/result in independent slot1 returning`23`;
- return to the long slot with correct middle-key recall,64684 cached and15 evaluated tokens.

The saved-state native scan tests values, not just loader acceptance. Slot-file schema and compatibility guards were unchanged.

A focused delegated review found no obvious bug in the hunk. It noted the process-static flag, all-small-batch scope and simultaneous thread-count/pool switch. All are intentional and documented. The review covered the patch, not the full backend or serving lifecycle.

## Production update

Rui's approved objective was to complete acceleration and then maximise decode speed, using the best validated result. The update retained the working hybrid release as rollback, created a distinct immutable CPU-library release, and used an independent seven-minute rollback timer plus stop hook until acceptance.

Final production checks:

-5236-token GPU cold SSE tool call restored5235 tokens and evaluated one on the candidate CPU;
- three CPU-owned warm tool/append requests passed;
- zero fallback/error counts, empty queue, two idle128K slots;
- candidate library hash actually mapped, flag enabled, retained CPU/draft8/16 arguments verified;
- CPU swap zero, GPU worker absent after prefill;
- current service active with no restarts; temporary rollback timer stopped after acceptance.

The original hybrid adapter, speech-priority guards, serial8-request admission, two cached owners and4K..64K GPU eligibility are unchanged. Fully populated dual128K capacity, long HTTP cancellation and broader workload quality retain their earlier limits.

Rollback to the previous working hybrid release:

```
bash /var/home/agent/workspace/reports/gemma-decode-smallbatch-20260910/rollback.sh
```

This restores the saved hybrid unit, not the historical CPU-only service. It does not remove user cache files. Never run earlier maintenance scripts blindly: their saved baseline expects `20260910-sse1`, while production now uses `20260910-smallbatch`.

## Safety and evidence

Fresh speech checks preceded the isolated build, eight confirmations, qualification and conditional cutover. Build and trials used continuous job/native/socket checks,6GiB available-memory reserve,16MiB per-process swap limit and supervised restoration of the same hybrid service. Confirmation runs stayed above22.75GiB available memory, at zero trial swap and no more than79C. Speech services and private media/transcripts were untouched.

Three focused offline tests/21 assertions verify gate coverage and reconstruct the full candidate audit. The existing hybrid adapter suite remains20 tests/58 assertions. The offline verifier reconstructs the patched source from `abdbeadfb`, checks its hash, reruns tests and audits raw results, state and deployment evidence. No inference is required. Large slots, binaries and private release configuration are excluded from the Git export.

## Next discriminating work

Keep this measured improvement. Remaining decode candidates include small-row matrix packing/dispatch and independently tuning draft workers, but the profile gives draft work much less scope than target verification. Any next experiment should use the new small-batch release as its baseline, not the slower prior decoder. A larger coding-generation confirmation would test generality beyond this128-token recall/counting fixture.
