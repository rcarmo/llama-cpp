# Bonsai 2 27B PTQ1 zero-copy handoff qualification

Bonsai 2 27B PTQ1 benefits from Vulkan prompt prefill followed by zero-copy CPU generation on Intel Iris Xe UMA. The accepted target-only topology reduced median active wall time by 29.15% for 256+32 fixed tokens and by 24.11% for 1024+64 fixed tokens against full Vulkan. A 2048+64 one-shot run was 17.62% faster. All accepted handoffs used non-zero shared bytes and zero copied bytes.

This work does not deploy or enable a PTQ1 service. The primary Gemma 4 E4B QAT + MTP zero-copy service remains unchanged. The existing PQ2 CPU profile remains the production Bonsai alternative because PTQ1 CPU generation is slower.

## Status

| Area | Result |
|---|---|
| PTQ1 Vulkan prefill | Passed |
| Strict Vulkan-to-CPU handoff | Passed with shared bytes greater than zero and copied bytes equal to zero |
| CPU continuation after Vulkan source/model destruction | Passed |
| Exact synthetic handoff parity | Passed |
| Trained-model logit parity | Rejected; Vulkan top IDs vary between fresh runs and differ from CPU at meaningful sizes |
| Fixed-work performance | Passed at 256, 1024 and 2048 prompt tokens |
| OpenAI-compatible API, warm reuse and SSE | Passed |
| Forced client tool calls | Passed through an explicit CPU-only fallback |
| Embedded UI | Passed offline with retained embedded assets |
| Cancellation and slot recovery | Passed |
| Resource and rollback controls | Passed; unit-local swap and OOM counters were zero |
| Independent review | Passed after three publication defects were fixed |
| Deployment | Not performed |

## Scope

The implementation reuses the existing strict Qwen35 context handoff. It supports one target sequence, F16 K/V, `n_rs_seq=3`, Vulkan prompt prefill and CPU generation. Bonsai has no `nextn` metadata, so this topology has no MTP draft context.

The serving caller selects by model architecture and metadata. It does not route by model name. Normal target-only requests use strict Vulkan prefill and a zero-copy CPU destination. Requests with client tool definitions use a non-strict CPU-only context because meaningful-size Vulkan handoff state produced malformed forced-tool output. The response exposes that route as `cpu_target_tool_fallback` with `zero_copy=false`, `shared_bytes=0` and `copied_bytes=0`.

Excluded work:

- service installation, profile changes or default routing;
- reverse CPU-to-GPU transfer;
- multiple sequences;
- quantised K/V conversion;
- CUDA or Metal claims;
- generic scheduler automation;
- MTP without model metadata.

## Test system

| Field | Value |
|---|---|
| Date | 18-19 September 2026 |
| Branch | `feat/bonsai2-ptq1-zero-copy` |
| Starting source | `211508dd9` on top of `master=0813f3574` |
| Host | LattePanda Sigma |
| CPU | Intel Core i5-1340P, 12 cores, 16 threads |
| GPU | Intel Raptor Lake-P Iris Xe, PCI ID `8086:a7a0` |
| RAM | 31 GiB |
| Kernel | Fedora `7.2.4-200.fc44.x86_64` |
| Build | Rootless Fedora 44 Podman build container, network disabled |
| Model | `Ternary-Bonsai-2-27B-PTQ1_0.gguf` |
| Model SHA-256 | `53107f530aa52eb00912263ab1ee29bd199261c87cd7b4ad4ca1318c1fe33ee3` |
| Context | 2048 for service gates; fixed native harness sizes listed below |
| Target K/V | F16 |
| Sequences | 1 |
| Recurrent rollback depth | 3 |
| Threads | 12 target and batch threads |
| Native batch/ubatch | 256/256 for meaningful-size tests |
| Sampling | Fixed tokens for native qualification; temperature 0 for API gates |
| Thermal data | Not recorded |

The host had unrelated global zram use during final inspection. Every supervised benchmark unit and the restored Gemma service recorded zero swap. Resource claims below refer to the benchmark cgroups and service unit, not global zram.

## Correctness gates

The synthetic gate passed four checks in `synthetic-gates/tests.log`:

1. CPU fill, Vulkan scale, retained CPU alias, CPU in-place scale and a second Vulkan scale with zero tensor-copy callbacks.
2. F16 payload size, independent slot allocations, canaries and both buffer destruction orders.
3. Range/alignment rejection, offset aliases, CPU callbacks, allocation/backend lifetime and prefix canaries.
4. Strict Qwen Vulkan hybrid and hidden-state handoff, rollback and exact CPU continuation after source context/model destruction.

The synthetic strict Qwen transfer reported 66,496 shared bytes and zero copied bytes.

The trained-model harness required all of these fields for every accepted handoff run:

- expected `final_pos`;
- finite prefill and continuation logits;
- fixed prompt and continuation token counts;
- `shared_bytes > 0`;
- `copied_bytes == 0`;
- continuation after source context/model destruction;
- zero cgroup swap and OOM events.

Trained Vulkan hashes are diagnostic. Fresh-process Vulkan top IDs varied at 256 and 1024 prompt tokens, and handoff continuation top IDs differed from Vulkan. The campaign therefore does not claim trained numerical parity. This limitation also caused the zero-copy tool route to emit malformed forced-tool output. Tool-bearing requests use the explicit CPU fallback described above.

## Native fixed-work results

Active wall time excludes model loading and includes prefill, destination creation, handoff, required final-token re-evaluation and continuation. `n` counts accepted, counterbalanced runs. Invalid wrapper attempts in `repeat-256/invalid-*` are retained as diagnostics and excluded.

| Fixed work | Profile | n | Active wall median or one-shot | Shared bytes | Copied bytes | Final position | Result |
|---|---:|---:|---:|---:|---:|---:|---|
| 32+8 | CPU | 1 | 41.550 s | 0 | 0 | 39 | finite control |
| 32+8 | handoff | 1 | 19.767 s | 649,613,312 | 0 | 39 | passed |
| 256+32 | CPU | 1 | 288.639 s | 0 | 0 | 287 | finite control |
| 256+32 | `-ngl 16` | 1 | 86.827 s | 0 | 0 | 287 | conventional offload control |
| 256+32 | full Vulkan | 3 | 87.437 s | 0 | 0 | 287 | finite control |
| 256+32 | handoff | 3 | 61.945 s | 671,633,408 | 0 | 287 | 29.15% faster than full Vulkan |
| 1024+64 | full Vulkan | 2 | 215.043 s | 0 | 0 | 1087 | finite control |
| 1024+64 | handoff | 2 | 163.193 s | 737,693,696 | 0 | 1087 | 24.11% faster than full Vulkan |
| 2048+64 | full Vulkan | 1 | 295.522 s | 0 | 0 | 2111 | finite control |
| 2048+64 | handoff | 1 | 243.442 s | 825,774,080 | 0 | 2111 | 17.62% faster than full Vulkan |

Accepted repeat files:

- 256 full Vulkan: `repeat-256/02-vulkan-strict.log`, `repeat-256/03-vulkan-strict.log`, `repeat-256/06-vulkan-strict.log`;
- 256 handoff: `repeat-256/01-handoff.log`, `repeat-256/04-handoff.log`, `repeat-256/05-handoff.log`;
- 1024 full Vulkan: `repeat-1024/02-vulkan-strict/run.log`, `repeat-1024/03-vulkan-strict/run.log`;
- 1024 handoff: `repeat-1024/01-handoff/run.log`, `repeat-1024/04-handoff/run.log`;
- 2048 one-shot: `screen-2048/01-vulkan-strict/run.log` and `screen-2048/02-handoff/run.log`.

The handoff itself took 2.3-4.6 ms in accepted runs. The meaningful gain comes from using Vulkan for prefill and CPU for generation; transfer time alone is not the performance result.

## Service gates

The target-only server is built from `tools/gemma-hybrid/service.cpp` under both `llama-zero-copy-server` and the compatibility name `llama-gemma-zero-copy-server`. The final offline build produced byte-identical executables. UI asset provisioning reported `assets unchanged`, so the disconnected build retained the previously embedded files.

### API, warm reuse and SSE

`server-gates/` records:

- cold response `BONSAI_ZC_OK` through `vulkan_prefill_cpu_target`, with 803,753,984 shared bytes and zero copied bytes;
- warm response `BONSAI_ZC_WARM_OK` through `cpu_target_reuse`, with 32 cached prompt tokens;
- SSE response `BONSAI_ZC_STREAM_OK` with `Content-Type: text/event-stream`;
- embedded UI `GET /` response `200`, gzip encoding and `Content-Type: text/html`;
- automatic restoration of `gemma-4-e4b-qat-mtp-zero-copy` with `NRestarts=0` and zero service swap.

The cold API request completed in 18.978 s and reported a 2.445 ms handoff. These service timings are smoke evidence, not benchmark medians.

### Forced tools

The standard CPU `llama-server` control returned HTTP 200 and a valid `get_weather({"city":"Lisbon"})` tool call for the same 287-token forced-tool request. Handoff-generated state produced malformed repeated markers. The accepted server route therefore rebuilds the request in a CPU-only context when client tools are present.

`server-remaining-gates-r3/tool-response.json` records:

- `finish_reason="tool_calls"`;
- function `get_weather`;
- arguments `{"city":"Lisbon"}`;
- route `cpu_target_tool_fallback`;
- `zero_copy=false`, `shared_bytes=0`, `copied_bytes=0`.

Target-only response cleanup removes only an all-whitespace `<think>...</think>` prefix. The unit test covers complete and partial empty markers and preserves non-empty reasoning and plain content. This cleanup runs before streaming diff generation and on the final message.

### Cancellation and recovery

`server-remaining-gates-r3/` records a forced disconnect with timeout exit `124`. The slot returned to `processing=false`. A later normal request returned `BONSAI_ZC_RECOVERY_OK` through `vulkan_prefill_cpu_target` with 803,753,984 shared bytes and zero copied bytes.

The final parser-sensitive live check in `server-recovery-parser-gate/` returned exact visible content `BONSAI_ZC_RECOVERY_OK`, one strict handoff and the same zero-copy accounting. The supervised unit exited successfully.

### Resource controls

Each retained service gate ran inside an external transient user unit with `MemoryMax=24G`, `MemorySwapMax=0` and `TasksMax=512`. `run-guarded-server-gate.sh` reproduces that unit boundary and invokes the selected inner gate script. The final live gate recorded:

| Counter | Value |
|---|---:|
| `memory.peak` | 13,741,105,152 bytes |
| `memory.swap.current` | 0 |
| `memory.swap.peak` | 0 |
| `oom` | 0 |
| `oom_kill` | 0 |
| `oom_group_kill` | 0 |

The primary Gemma service was restored after every guarded window. The final state was active with `NRestarts=0`, `MemorySwapCurrent=0` and `MemorySwapPeak=0`. No PTQ service or process remained active.

## Prior-feature reuse checklist

- [x] Feature: strict Qwen35 whole-context handoff
  - Source: `src/llama-context-handoff.cpp`, commits `3e33c2952`, `2b4c5850e` and `bb0401449`
  - Applicability: Bonsai reports architecture `qwen35` and contains recurrent SSM state plus periodic full attention.
  - Status: adapted
  - Implementation: target-only mode in `tools/gemma-hybrid/service.cpp` and `tests/test-qwen-target-trained-handoff.cpp`; no model-name routing or core API fork
  - Evidence: synthetic exact gate, trained 32/256/1024/2048 runs and service recovery gate

- [x] Feature: cached coherent Intel UMA allocation and retained CPU buffer views
  - Source: `ggml/src/ggml-vulkan/ggml-vulkan.cpp`, `docs/local/intel-i5-1340p/in-memory-kv-handoff.md`, commit `d2028882b`
  - Applicability: Sigma uses Intel Iris Xe UMA and strict transfer must expose each payload through a retained CPU view.
  - Status: applied
  - Implementation: existing strict allocation and `ggml_backend_vk_buffer_cpu_view` registry path
  - Evidence: 649,613,312 to 825,774,080 shared bytes, zero copied bytes and continuation after source destruction

- [x] Feature: recurrent R/S state, rollback snapshots and hidden-state ownership transfer
  - Source: `src/llama-memory-recurrent-handoff.cpp`, `src/llama-context-handoff.cpp`, `tests/test-context-handoff.cpp`
  - Applicability: Bonsai has Qwen35 recurrent metadata and `full_attention_interval=4`.
  - Status: applied
  - Implementation: strict target context with `n_rs_seq=3` and the existing atomic transaction
  - Evidence: synthetic rollback/exactness and trained final positions 39, 287, 1087 and 2111

- [x] Feature: MTP target/draft four-payload handoff
  - Source: `common/speculative.cpp`, `tests/test-qwen-mtp-trained-handoff.cpp`, commit `49a3e3780`
  - Applicability: the Bonsai GGUF has no `nextn` metadata or draft model.
  - Status: not applicable
  - Implementation: none; the service is target-only
  - Evidence: frozen GGUF metadata has 64 blocks and no `nextn` key

- [x] Feature: source consumption, borrower rejection and retained-allocation lifetime rules
  - Source: `src/llama-context-handoff.cpp`, `tests/test-context-handoff.cpp`
  - Applicability: CPU continuation must survive destruction of the Vulkan context and model.
  - Status: applied
  - Implementation: existing transaction; trained qualifier frees source context/model before continuation
  - Evidence: synthetic lifetime checks and every accepted trained handoff run

- [x] Feature: bounded copied-state control
  - Source: `tools/gemma-hybrid/in-memory.cpp`, `benchmarks/intel-1340p/xe-zero-copy-throughput-20260914/`
  - Applicability: transfer cost and ownership must be separate from compute placement.
  - Status: adapted
  - Implementation: strict handoff candidate with CPU, full Vulkan and `-ngl 16` controls; no copied handoff arm because the target-only strict transaction rejects copying
  - Evidence: fixed-work matrix and explicit shared/copied counters

- [x] Feature: meaningful-size prefill matrix and counterbalanced ordering
  - Source: `benchmarks/intel-1340p/qwen38-vulkan-mtp-memory-20260915/run-prefill-matrix-source.sh` and `skills/hybrid-inference-optimization/SKILL.md`
  - Applicability: short screens do not predict useful Vulkan prefill performance.
  - Status: adapted
  - Implementation: short smoke, 256/1024 repeats and a 2048 one-shot with fixed continuation work
  - Evidence: repeat lists and native results table above

- [x] Feature: resource guards, exclusive GPU ownership and automatic primary restoration
  - Source: prior Sigma handoff campaigns and `tools/gemma-profile`
  - Applicability: the primary Gemma service shares RAM and `/dev/dri/renderD128`.
  - Status: applied
  - Implementation: serial transient units, no unit swap, bounded memory/time/PIDs, DRM ownership checks and restoration traps
  - Evidence: cgroup records and `restore.log` files; final Gemma state has zero restarts and service swap

- [x] Feature: zero-copy OpenAI API, SSE, tools and embedded UI serving
  - Source: `tools/gemma-hybrid/service.cpp` and `tools/gemma-hybrid/README.md`
  - Applicability: the native topology passed correctness and performance gates.
  - Status: adapted
  - Implementation: architecture-gated target-only mode; zero-copy for ordinary requests and explicit CPU fallback for requests with tools
  - Evidence: `server-gates/`, `server-remaining-gates-r3/` and `server-recovery-parser-gate/`

- [x] Feature: existing PTQ1 CPU/Vulkan kernels and unsupported-operation boundaries
  - Source: commits `e96d552c0`, `a21384cf8`, `a9ca156ea` and `c4ea0f7de`
  - Applicability: handoff must preserve the qualified PTQ1 matmul/get-rows path, copy/set-row rejection, coopmat2 exclusion and public metadata value.
  - Status: applied
  - Implementation: inherited without PTQ kernel changes on this branch
  - Evidence: focused PTQ integration gates from `bonsai2-27b-integration-20260918/ptq1-qualification/` plus the synthetic and trained handoff gates

## Reproduction

Build and focused policy test:

```bash
cmake --build build-bonsai-zc --target \
  llama-zero-copy-server \
  llama-gemma-zero-copy-server \
  test-gemma-hybrid-session-policy -j 4
ctest --test-dir build-bonsai-zc --output-on-failure \
  -R '^test-gemma-hybrid-session-policy$'
```

Native guarded profiles:

```bash
benchmarks/intel-1340p/bonsai2-27b-zero-copy-20260918/run-guarded-profiles.sh \
  OUTPUT_DIR PREFILL_TOKENS CONTINUE_TOKENS PROFILE...
```

Service gates are split to avoid repeating expensive passed work. Run each inner script through the checked-in transient-unit launcher:

```bash
base=benchmarks/intel-1340p/bonsai2-27b-zero-copy-20260918
$base/run-guarded-server-gate.sh bonsai-zc-server-gates \
  "$PWD/$base/run-server-gates.sh" "$PWD/$base/server-gates-new"
$base/run-guarded-server-gate.sh bonsai-zc-server-remaining \
  "$PWD/$base/run-server-remaining-gates.sh" "$PWD/$base/server-remaining-gates-new"
$base/run-guarded-server-gate.sh bonsai-zc-recovery-parser \
  "$PWD/$base/run-server-recovery-parser-gate.sh" "$PWD/$base/server-recovery-parser-gate-new"
```

`run-server-parser-gates.sh` retains the failed exact-content diagnostic that identified the empty-think prefix. It is not an accepted final gate.

## Evidence layout

- `synthetic-gates/`: focused Vulkan ownership, lifetime, rollback and exactness checks;
- `trained-smoke/`: matched 32+8 CPU and handoff screen;
- `screen-256/`, `screen-1024-resume/`, `screen-2048/`: fixed-work qualification;
- `repeat-256/`, `repeat-1024/`: accepted counterbalanced repeats and labelled invalid wrapper diagnostics;
- `server-gates/`: cold, warm, SSE and embedded UI evidence;
- `tool-cpu-control/`: standard CPU server tool-call control;
- `tool-diagnostic/`, `tool-diagnostic-r2/`: failed handoff tool diagnostics;
- `server-remaining-gates-r3/`: accepted tool fallback, cancellation and recovery responses; the wrapper exited after a response-content assertion;
- `server-parser-gates/`: failed empty-think exact-content assertion;
- `server-recovery-parser-gate/`: final passing exact parser, zero-copy and resource gate;
- `independent-review.md`: first review findings, fixes and final PASS.

The failed diagnostic directories are retained because they explain the CPU tool fallback and parser correction. They are excluded from performance medians and passing-gate counts.

## Post-qualification implementation improvement

A 19 September follow-up separates current resident-slot telemetry from process-lifetime counters. `/health` now reports a mutex-backed `route`, `zero_copy_ready`, `current_shared_bytes` and `current_copied_bytes` snapshot while idle or processing. `handoffs_total`, `shared_bytes_total` and `copied_bytes_total` retain lifetime accounting; the previous field names remain compatibility aliases on idle responses.

The route table is a pure policy function with tests for cold and warm Gemma, target-only, CPU tool fallback and CPU tool-fallback reuse paths. Exact object tests cover busy and idle health responses. Concurrent reader/writer tests check complete route states and conversation ownership. Reset uses an owner generation token so an old reset cannot clear a newer request with the same conversation ID. The guarded runners assert current and lifetime fields separately and use `CONTINUE_TOKENS` consistently.

This follow-up does not change context construction, handoff mechanics, fixed-work results, the CPU tool fallback decision or deployment state. The retained `health-*.json` and tool-response files are pre-follow-up observations and do not contain the new health fields. Exact offline tests cover busy and idle health JSON, legacy alias presence, lifetime totals, parser cleanup, route transitions and concurrent route/owner reads. The modified runners define future live acceptance for the new fields.

A fresh offline build passed the policy test 200 consecutive times and passed `test-context-handoff`; the two server target names remained byte-identical. Independent concurrency review passed after the route mutex, owner-generation and cancellation-admission fixes. No GPU rerun was needed.
