# Sigma controls and retained lessons

This is a host-specific reference, not a universal performance recommendation. Confirm current settings and evidence before reuse.

## Hardware and workload

- Sigma: Intel i5-1340P, Iris Xe, approximately 31 GiB usable shared RAM; observed PCI vendor/device `8086:a7a0`.
- P-core logical CPUs 0-7, E-core logical CPUs 8-15. Verify current topology and worker placement; process masks alone do not establish OpenMP thread affinity.
- The deployed Gemma service uses the E4B QAT Q4_0 target, Q8_0 MTP assistant, one 32,768-token slot, Vulkan batch/microbatch 256/256, CPU decode/prefill threads 8/16, MTP depth 3, F16 K/V and Flash Attention off. It retains CPU and Vulkan model owners, creates a fresh Vulkan context for each cold conversation, hands K/V to CPU in process and streams prompt progress plus generated deltas on port 8094.
- The historical file-mediated CPU profile used batch/microbatch 1024/256, compact SWA and two 131,072-token slots. It is disabled. The source checkout, experimental candidate and retained service binary can be different revisions. Record loaded-library hashes and exact argv.

## Approved campaign controls, 10 September 2026

- Heavy work required explicit coordination with the speech session and zero nonterminal jobs at `http://127.0.0.1:8092/api/jobs`.
- Sample `diar-server` CPU activity, `whisper-cli` presence and queued bytes on speech ports. Never read media, transcripts or private error payloads to determine load.
- Maintain at least 6 GiB available RAM and at most 16 MiB swap per trial process. Stop only experiments if speech/native work begins. These are the campaign's limits, not automatic permission for future maintenance.
- Temperatures at or above 95 C are annotations under this campaign's approval. Preserve hardware throttling/protection and record thermal context.
- Production Gemma may be stopped only within the approved maintenance window. Use a bounded systemd user unit/process group and `ExecStopPost` restoration; containers need explicit trial ownership and cleanup too.
- For dated file-mediated experiments, verify the saved binary/config/unit/library identity, two slots, tools and growing-prefix cache against that campaign's restoration record. For current maintenance, restore `llama-gemma-zero-copy.service` and `llama-gemma-lan-test.socket`, then verify the resident Vulkan model, one slot, live stream progress, tools, append reuse, positive shared bytes, zero copied bytes and zero cgroup swap.

## Scoring and interpretation

The corrected quality campaign prespecified <=5 percentage points task-loss tolerance, <=0.25 points on a 0-4 blind score, >=10% whole cold-request improvement and <=10% warm regression for automatic promotion. These were experiment criteria, not permanent prohibitions. Report confidence and sample size; three or four successes do not establish a 5-point noninferiority bound.

A failed provisional timing gate can still justify a retained branch or an explicitly accepted pilot. Keep numerical corruption, task errors, unsupported lifecycle and small latency costs separate. Exact CPU/GPU output equality was withdrawn as a promotion gate.

## Dated evidence: what it establishes

| Observation on 10 September 2026 | Scope and limit |
|---|---|
| Large-softmax reduction fix removed NaNs in the failing 32K GPU state | Isolated shader fix plus finite-state and target/MTP recall checks; not a full backend suite |
| Retaining padded compact-SWA history changed 4K restore from 4348 evaluated tokens to 1 | Existing valid cells preserved; native rollback check unchanged |
| Validated Gemma text-only v3 state converted to retained CPU v2 | New server token wrapper explicitly removed; token IDs and KV payload unchanged; not generic state migration |
| 64663-token recall/append passed; initial full request 746.82 s | One populated long slot; no matched CPU64K speedup or full dual128K load qualification |
| Eight real coding workflows: 28.79% lower whole median, 3.42% slower warm rounds | Same retained CPU/compact geometry; GPU cold prefill then unload; one coding task, four runs/profile |
| GPU microbatch 1024: repeated 64K-tail prefill 5.52% faster, one fresh64K request 3.33% slower | Retain for phase-specific tuning; insufficient evidence for a global default change |
| Split-K4: confirmed 64K-tail median effectively neutral (+0.06% time) | Native synthetic default/F32 long reductions improve from 2/4 baseline passes to 4/4; retain as opt-in numerical candidate |
| CPU four-core/16-thread/bound-OpenMP and MTP1/5 screens did not beat 8-thread/MTP3 | Sequential bounded screens, not proof of the global optimum |
| GPU FA-on 64K tail slower with invalid output | Exact offline layout roundtrip does not isolate the native FA failure; no promotion |

## State-layout and tuning lessons

- This Gemma layout has four independent global KV layers and twenty sliding layers. F16 full-SWA and compact-SWA allocations differ substantially; do not extrapolate resident capacity from a saved-slot file's size.
- GPU microbatch 1024 grows the compact ring beyond the CPU microbatch 256 ring. Experimental handoff exports cap the standard window to 512 + 256 existing cells. This cap is model/target-profile-specific and must be reconsidered for another destination.
- `v3 -> v2` conversion is a parser/format operation, not permission to overwrite a version field blindly. Media wrappers, extended KV cells, types, stream counts and row widths must be rejected unless explicitly supported.
- Iris Xe lacks the shader-core entry used by the current automatic split-K heuristic. An opt-in long-F16 override showed a numerical benefit, but the experiment's Intel-wide gate is broader than the tested device. Narrow and revalidate before any default change.
- Longer microbatches, alternate precision, thread binding and backend residency can change the ranking. Keep the losing measurement and record a concrete follow-up instead of treating it as a permanent dead end.

## Evidence locations

Historical local campaign roots under the workspace `reports/`:

- `gemma-kv-quality-20260910`: corrected parity policy, task gates, large-softmax fix, owner-router and restoration evidence.
- `gemma-context-coding-20260910`: aligned compact-SWA state conversion, 64K recall and counterbalanced coding.
- `gemma-hybrid-perf-20260910`: CPU/attention/batch/split-K screens, confirmed tails, fresh64K finalist, retained opportunities and review notes.

Version-controlled exports belong under `benchmarks/intel-1340p/`, with source manifests and explicit experimental/deployed status. Large slot files and runtimes stay local. The current deployment record is `benchmarks/intel-1340p/gemma-zero-copy-service-20260915/`; dated 10-11 September reports preserve historical deployment state and are not restoration instructions for the current service.
