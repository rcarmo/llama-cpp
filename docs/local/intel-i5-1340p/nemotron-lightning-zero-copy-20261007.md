# Nemotron Lightning strict handoff, 7 October 2026

Experimental strict Intel Vulkan-to-CPU state transfer passes native correctness gates for Nemotron-H and Nemotron-H-MoE. It is not deployed. The fixed-token timing screen favours CPU at 512 tokens and handoff at 1024 tokens when model loading is included. This does not establish task quality, a serving crossover or a general speedup.

## Scope and source

Implementation checkpoint: `47368961c64c4518f1f02a77f0cfecb957f5a371`.

Parent: `fdfd814abcb34915b23a5f206c88c834f0f1333f`, branch `implement/nemotron-strict-zero-copy`. The implementation checkpoint contains the exact patch and tests; [evidence](../../../benchmarks/intel-1340p/nemotron-lightning-zero-copy-20261007/README.md) retains manifests, loaded-library hashes, raw logs and reproduction sources. Assistant: OpenAI coding assistant, with manual source review. Two independent delegate review attempts failed (context rejection and timeout); they provided no approval.

Host: Sigma, Intel i5-1340P / Iris Xe `8086:a7a0`, physical `renderD128`, 31 GiB RAM. Fedora 44 rootless Podman image, GCC 16.1.1, Release, native CPU/repack/OpenMP, Vulkan on, dynamic backend loading off, Flash Attention off. No dedicated thermal samples or observed worker-affinity qualification were collected.

Exact model: `NVIDIA-Nemotron-3.5-Lightning-30B-A3B-Q4_0.gguf`, Hugging Face revision `8a08a1c81dadcc75d35dbb96016cfd344b632e67`, 18,898,091,584 bytes. The previously verified model file was reused. No model/configuration/history was removed.

Admission requires DEFAULT context, one sequence, Mamba2 convolution 4 / state 128 / head dimension 64, no MTP/PLE/SWA/borrower, identical architecture and state layout, and Vulkan-backed mapped payloads. Unsupported geometry fails closed. A final source review added the CPU scan requirement that head count be divisible by group count, with an invalid-head/group regression. CPU13 and both builds passed again; native supported-geometry observations use the preceding recorded library hash. The public strict path does not admit CPU-to-CPU transfer or copying fallback. Ordinary context allocation and strict allocation both exclude Nemotron FFN-only layers from attention and recurrent caches.

## Correctness gates

| Gate | Result | Limit |
|---|---|---|
| CPU CTest | 13/13 pass | Focused suite, not full CI |
| Intel synthetic Nemotron-H and MoE | Six runs pass: rollback depths 1, 2, 3 | Tiny trained-independent fixtures |
| Intel existing Qwen target and target+MTP | Two runs pass | Synthetic, no Qwen service restoration |
| Source ownership | Source consumed; later decode, borrower and transfer rejected; source context/model destroyed before CPU continuation | No server crash/cancellation qualification |
| State comparison | Exact metadata and K/V/R/S payload bits before transfer, after rollback and after each CPU step | Ordinary wire state does not contain historical rollback snapshots |
| Exact Lightning | 32, 256, 257, 512, 1024 prefill tokens, two fixed continuation tokens | Finite logits, zero copied bytes, correct positions; not natural-language/code quality |
| Exact Lightning copied reference | Last-token re-evaluation and two CPU steps match every vocabulary logit bit after GPU source/model release | Same GPU-produced state; no cross-backend numerical equivalence claim |

Shared payload bytes at 32/256/257/512/1024 tokens: `204057088`, `208382464`, `208382464`, `212707840`, `221358592`; copied payload bytes are zero in each run. The odd-tail run uses chunks 127 + 127 + 3. Handoff accounting covers state, not GPU weight upload, CPU repacking or diagnostic snapshot copies.

The initial rollback test was invalid: it serialized the final current row, restored it into a CPU reference, then attempted to rewind both contexts. Wire serialization does not preserve earlier R/S snapshot rows. After one continuation step, the first mismatch was F32 `cache_r_l1` at offset 304 (`0x80000000` versus `0x00000000`). A temporary signed-zero diagnostic did not qualify the implementation and was removed. The corrected oracle independently decodes the same batches in a second Vulkan context, checks the original state exactly, rewinds that context, compares all rolled payload bits, then restores that rolled current state to the CPU reference. No tolerance or zero-sign exception remains. The original failure log is retained.

Borrowed-source and destination-abort failures preserve source state and leave destination memory absent. Descriptor tests additionally check abandoned preparation, failed computation, architecture mismatch, ownership lifetime and unsupported model geometry. Native backend crash injection and both destruction orders are not qualified.

## Fixed-work timing screen

Same fixed token IDs (`100 + i % 100`), CPU4, one sequence, batch 512 / chunk 128 / microbatch 128, F16 K/V, F32 R/S, three rollback slots, mmap, two fixed continuation tokens. Fresh processes in CPU/handoff/handoff/CPU order, two observations per profile per size. Reproduction reference checking is disabled for timed observations. GPU model weights are released after transfer; last prompt token is re-evaluated on CPU. File cache is naturally warm across runs, not flushed. These are nonsemantic workloads without sampling or API overhead.

| Prefill | Profile | Prefill seconds, individual | Active seconds, individual | Total seconds, individual |
|---|---|---|---|---|
| 512 | CPU | 12.546, 12.432 | 12.696, 12.579 | 15.219, 14.747 |
| 512 | Handoff | 6.198, 6.258 | 7.528, 7.620 | 16.418, 18.172 |
| 1024 | CPU | 24.682, 25.012 | 24.823, 25.159 | 27.258, 27.616 |
| 1024 | Handoff | 12.323, 12.245 | 13.515, 13.301 | 23.274, 26.752 |

Active includes prefill, destination setup/transfer, GPU release, last-token re-evaluation and continuation, but excludes model load and source-context setup. Total includes these additional costs. Relative to the mean CPU observation, handoff active time is 40.1% shorter at 512 and 46.3% shorter at 1024; total is 15.4% longer at 512 and 8.8% shorter at 1024. Two samples per profile are screening evidence, not a confident crossover estimate. GPU loading takes roughly 8-11 seconds and depends on memory/page state; CPU continuation also varies under reclaim.

Every exact-model handoff run reaches the 20 GiB cgroup ceiling and records `memory.events max` reclaim events. Across retained successful model runs, peak is 21,474,836,480 bytes, minimum sampled host available memory is 12,037,872 KiB, swap is zero, and OOM/OOM-kill counters are zero. The 6 GiB host reserve held. Initial model launch was terminated by a monitor-script failure (copying read-only cgroup metadata preserved mode 0444); the monitor now reads values into a writable owned file. This interrupted load is excluded from results. Earlier shell-wrapped container diagnostics returned 125 without payload; direct execution with a host-owned timeout succeeded. All failed logs remain in the original local run directory.

## Prior-feature reuse checklist

- [x] Feature: atomic strict Qwen hybrid/hidden handoff.
  - Source: `src/llama-context-handoff.cpp`, `src/llama-memory-recurrent-handoff.cpp`.
  - Applicability: same ownership transaction, different recurrent architecture.
  - Status: adapted.
  - Implementation: model capability gate, architecture-aware recurrent compatibility, Nemotron layer filters; existing commit transaction retained.
  - Evidence: CPU handoff tests, six native Nemotron rollback runs, two existing Qwen regressions, real-model finite/exact continuation.
- [x] Feature: retained coherent Vulkan CPU views.
  - Source: `src/llama-memory.cpp`, existing recurrent/KV handoff transfer objects.
  - Applicability: shared-memory Intel allocations outlive source context/model.
  - Status: applied.
  - Implementation: existing backend allocation and ownership views unchanged.
  - Evidence: positive shared bytes, zero copied bytes, source/model destruction and exact continuation.
- [x] Feature: Mamba2 R/S snapshots and gather-once fix.
  - Source: `src/models/mamba-base.cpp`, upstream integration parent `fdfd814ab` / recurrent gather `c35fa613b`.
  - Applicability: Nemotron convolution/scan state rather than Qwen gated-delta state.
  - Status: applied.
  - Implementation: original builder and state-size formula reused unchanged.
  - Evidence: exact rollback depths 1-3 on Intel, odd-tail and real Lightning runs.
- [x] Feature: low-memory mmap and GPU-owner release.
  - Source: pi pilot `d33612b45`, retained target-trained handoff harness.
  - Applicability: avoid retaining GPU weights during CPU continuation.
  - Status: adapted.
  - Implementation: isolated qualifier uses mmap for both model owners and releases GPU weights after transfer.
  - Evidence: exact copied-reference continuation after release; resource logs and fixed-work timings.
- [x] Feature: embedded MTP and PLE.
  - Source: existing paired Qwen handoff.
  - Applicability: unsupported Nemotron layout in this narrow admission.
  - Status: not applicable.
  - Implementation: explicit rejection; Qwen route retained.
  - Evidence: rejected Nemotron MTP context and unchanged Qwen paired native regression.
- [ ] Feature: serving controller, tools and warm-prefix routing.
  - Source: `tools/gemma-hybrid/service.cpp` and pi pilot.
  - Applicability: future user-facing Nemotron integration.
  - Status: deferred.
  - Implementation: none; no serving change authorised here.
  - Evidence: primitive gates do not establish task quality, disconnect/native cancellation, crash recovery, warm append or resource admission at serving capacity.
- [ ] Feature: imported epsilon/MTP/MoE shader optimisations.
  - Source: retained parent cherry-picks `959551a51`, `a06d02a82`, `c35fa613b`, `fdfd814ab`.
  - Applicability: eligible model/backend paths.
  - Status: deferred for causal performance attribution.
  - Implementation: parent preserved, no ablations or forced dispatch.
  - Evidence: whole-model runs exercise the retained stack, not isolated gains from each cherry-pick; MTP excluded.

## Operational state and next gates

Native containers/processes are drained; DRM clients empty. Compute reservation released to `@whisper`. Qwen 11434/8094, Gemma and speech remain stopped; persistent disabled state was preserved. No default-branch merge, persistent deployment or automatic service restoration is part of this checkpoint. Unrelated path-policy edits in the primary checkout remain untouched.

Next: natural prompt/code/tool quality, long and cached append workloads, native cancellation/crash recovery, bounded serving admission and a better-powered end-to-end comparison. The current primitive is a tested experiment, not a production profile.

## Native semantic supplement

The [semantic supplement](../../../benchmarks/intel-1340p/nemotron-lightning-zero-copy-20261007/semantic/README.md) extends, not repeats, this checkpoint: five CPU/handoff fixture pairs pass native arithmetic/warm follow-up, executable code,1324-token positional recall, required weather tool/result follow-up and thinking arithmetic. Follow-ups reuse33/304 prompt tokens on CPU after GPU-owner destruction. These are one observation per fixture/profile, not broad task-quality or speed qualification.

SIGKILL during marked native prefill and CPU generation exits137 and drains; a fresh handoff correctly answers9x9=81. This establishes discard-and-fresh-process recovery, not driver crash, graceful API cancellation, queued requests or exactly-once external tools. All services remain off and compute is released. Future serving/capacity/native driver-failure work remains unqualified.
