# Bonsai 2 27B PTQ1 zero-copy handoff qualification

This campaign tests the existing strict Qwen35 Intel UMA handoff with the Bonsai PTQ1 model. The previous PTQ1 campaign measured CPU and conventional Vulkan layer offload but did not test Vulkan prefill followed by zero-copy CPU generation.

## Refinement notes

- Problem: full Vulkan processes long prompts quickly on Iris Xe but generates slowly. CPU generation is faster. Conventional `-ngl` splits do not move a populated conversation from Vulkan to CPU.
- User: the local Sigma model service and explicit Bonsai experiments.
- Outcome: use Vulkan for prompt prefill, transfer all required target state through retained CPU views with `copied_bytes=0`, destroy the Vulkan source, and continue on CPU.
- Minimum scope: one Qwen35 sequence, target-only PTQ1 model, F16 K/V, strict one-way Vulkan-to-CPU handoff, greedy fixed-work continuation and benchmark harness.
- Excluded: deployment, default routing, reverse CPU-to-GPU transfer, multiple sequences, quantised K/V conversion, CUDA/Metal claims, generic scheduler automation and MTP without model metadata.
- Existing pattern: strict Qwen35 handoff in `src/llama-context-handoff.cpp`, synthetic coverage in `tests/test-context-handoff.cpp`, and the trained Qwen qualifier in `tests/test-qwen-mtp-trained-handoff.cpp`.
- Failure: reject the whole transfer if any payload cannot use a retained CPU view. Do not copy as fallback. Consume the source only after the complete transaction commits.
- Persistence: none. State remains in one process and no K/V state file is written.
- Performance gate: compare matched CPU, full Vulkan and Vulkan-prefill-to-CPU-handoff profiles at short and meaningful prompt sizes. Report stage and whole-workload time, not only handoff time.
- Host limits: serial bounded units or containers, `MemorySwapMax=0`, no OOM, at least 6 GiB available memory, automatic Gemma restoration, and coordination for `renderD128`.
- Correctness gate: expected final position, finite logits, fixed token work, `shared_bytes > 0`, `copied_bytes == 0`, successful continuation after GPU source/model destruction, and unchanged source/runtime defaults. Record every logits top ID and hash. Exact synthetic continuation must match its copied reference. Trained Vulkan hashes are diagnostic because the inherited Qwen35 Vulkan path has documented long-context variation.
- Closure: publish only if the topology is correct and materially useful for at least one measured workload. Otherwise retain the evidence as a rejected experiment and correct the earlier performance conclusion.

## Prior-feature reuse checklist

- [x] Feature: strict Qwen35 whole-context handoff
  - Source: `src/llama-context-handoff.cpp`, commits `3e33c2952`, `2b4c5850e` and `bb0401449`
  - Applicability: Bonsai reports architecture `qwen35` and contains recurrent SSM state plus periodic full attention.
  - Status: adapted
  - Implementation: target-only manual qualifier in this campaign; no model-name routing or core API fork
  - Evidence: pending focused synthetic and trained PTQ1 handoff tests

- [x] Feature: cached coherent Intel UMA Vulkan allocation and retained CPU buffer views
  - Source: `ggml/src/ggml-vulkan/ggml-vulkan.cpp`, `docs/local/intel-i5-1340p/in-memory-kv-handoff.md`, commit `d2028882b`
  - Applicability: Sigma uses Intel Iris Xe UMA and the strict source must expose all transferable allocations to CPU without payload copies.
  - Status: applied
  - Implementation: existing strict context allocation and `ggml_backend_vk_buffer_cpu_view` registry path
  - Evidence: require `shared_bytes > 0`, `copied_bytes == 0` and post-source-destruction CPU continuation

- [x] Feature: recurrent R/S state, rollback snapshots and hidden-state ownership transfer
  - Source: `src/llama-memory-recurrent-handoff.cpp`, `src/llama-context-handoff.cpp`, `tests/test-context-handoff.cpp`
  - Applicability: the model has Qwen35 recurrent metadata and `full_attention_interval=4`.
  - Status: applied
  - Implementation: strict target context with `n_rs_seq=3`; transfer occurs in the existing atomic transaction
  - Evidence: require positions, finite continuation and rollback/synthetic regressions

- [x] Feature: MTP target/draft four-payload handoff
  - Source: `common/speculative.cpp`, `tests/test-qwen-mtp-trained-handoff.cpp`, commit `49a3e3780`
  - Applicability: the Bonsai GGUF has no `nextn` metadata or embedded MTP layer, and the model repository has no draft model.
  - Status: not applicable
  - Implementation: none; qualifier is target-only
  - Evidence: frozen GGUF metadata has 64 blocks and no `nextn` key

- [x] Feature: source consumption, borrower rejection and retained-allocation lifetime rules
  - Source: `src/llama-context-handoff.cpp`, `tests/test-context-handoff.cpp`
  - Applicability: CPU continuation must remain valid after Vulkan context and model destruction.
  - Status: applied
  - Implementation: existing transaction; qualifier explicitly frees source context/model before continuation
  - Evidence: pending synthetic and trained PTQ1 source-destruction checks

- [x] Feature: bounded copied-state control
  - Source: `tools/gemma-hybrid/in-memory.cpp`, `benchmarks/intel-1340p/xe-zero-copy-throughput-20260914/`
  - Applicability: isolates transfer cost from CPU/Vulkan compute and verifies that zero-copy is not inferred from unified memory alone.
  - Status: adapted
  - Implementation: use strict handoff as the candidate and true CPU/full Vulkan as workload controls; add copy control only if it can share identical state geometry without weakening strict invariants
  - Evidence: pending benchmark matrix; any omitted copy arm will be stated explicitly

- [x] Feature: meaningful-size prefill matrix and counterbalanced ordering
  - Source: `benchmarks/intel-1340p/qwen38-vulkan-mtp-memory-20260915/run-prefill-matrix-source.sh` and `skills/hybrid-inference-optimization/SKILL.md`
  - Applicability: seven-token and 32-token screens do not predict useful Vulkan prefill performance.
  - Status: adapted
  - Implementation: include short smoke plus at least 256, 1024 and 2048 prompt-token cells when capacity permits; counterbalance finalists
  - Evidence: pending per-run results, medians and complete fixed-work accounting

- [x] Feature: resource guards, exclusive GPU ownership and automatic primary restoration
  - Source: prior Sigma handoff campaigns, `tools/gemma-profile`, and retained benchmark wrappers
  - Applicability: the primary Gemma service shares RAM and `renderD128`.
  - Status: applied
  - Implementation: serial transient units/containers with no swap, bounded memory/time/PIDs, ownership checks and restoration trap
  - Evidence: pending cgroup, process, DRM and final primary-state captures

- [ ] Feature: zero-copy OpenAI API, SSE, tools and embedded UI serving
  - Source: `tools/gemma-hybrid/service.cpp` and `tools/gemma-hybrid/README.md`
  - Applicability: required only if the native topology passes correctness and performance gates.
  - Status: deferred
  - Implementation: none before native qualification; generalise the existing service only after a useful native result
  - Evidence: native gate pending; deployment remains excluded

- [x] Feature: existing PTQ1 CPU/Vulkan kernels and unsupported-operation boundaries
  - Source: commits `e96d552c0`, `a21384cf8`, `a9ca156ea`, `c4ea0f7de`
  - Applicability: the handoff topology must preserve the qualified PTQ1 matmul/get-rows path, copy/set-row rejection, coopmat2 exclusion and public metadata value.
  - Status: applied
  - Implementation: inherited from current master without modification
  - Evidence: rerun focused PTQ1 Vulkan and handoff regressions before trained model execution

## Configuration inheritance matrix

| Setting or feature | Previous accepted value | Candidate state |
|---|---|---|
| Model and tokeniser | PTQ1 SHA-256 `53107f530aa52eb00912263ab1ee29bd199261c87cd7b4ad4ca1318c1fe33ee3` | preserved |
| Architecture | Qwen35, 64 blocks | preserved |
| K/V type | F16 | preserved from strict Qwen handoff |
| Sequence count | 1 | preserved |
| Recurrent rollback depth | 3 | preserved from strict Qwen handoff |
| Source KQV/op offload | enabled | preserved |
| Destination KQV/op offload | disabled | preserved |
| Copy fallback | disabled | preserved |
| Flash Attention | compare disabled and qualified `on` only if strict geometry accepts both | retest |
| Prompt/generation work | fixed tokens and positions | retest |
| MTP | absent in model | excluded |
| Services/default route | unchanged | preserved |
| Resource policy | no swap/OOM, bounded serial work, restore primary | preserved |

## Initial implementation path

1. Add a target-only exact-model qualifier by reducing the existing trained Qwen MTP harness. Keep the strict context constructor and result schema compatible with prior parsers where practical.
2. Run existing handoff CTest coverage and the synthetic Qwen Vulkan mode before loading PTQ1.
3. Run one short trained CPU/handoff correctness screen. Confirm shared/copy accounting, positions, finite logits and source/model destruction.
4. Extend to meaningful prompt sizes and fixed generated tokens only after the short gate passes.
5. Generalise the serving caller only if native whole-workload performance is useful.
