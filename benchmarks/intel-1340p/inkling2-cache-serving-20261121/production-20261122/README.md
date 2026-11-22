# Inkling CPU production runtime, 22 November 2026

Inkling 2 Mini is live at http://192.168.1.70:11434/ from source `c0dad48a5fdd024785e38c65b91662e99d62dec0`. The CPU4/16/cache768 profile is unchanged. GPU serving is disabled.

- Accepted: 2026-11-22T15:45:09.218Z.
- Runtime: `/var/home/agent/workspace/projects/llama-cpp/runtime/deployments/inkling2-mini-cpu-c0dad48a5-27967dc0eaff`.
- Unit/container: `inkling2-mini-prod-webui-20261122`, transient, `Restart=no`.
- Model: official Inkling 2 Mini IQ4_NL; existing Q8_0 CPU vision projector. No downloads or model changes.
- Exact [arguments](serving-profile.json): strict4/16, masks0x55/0xffff, poll50, context65536/parallel1, batch512/ubatch128, F16 KV/FAoff, cache768MiB, checkpoints2/default spacing8192, mmap/no-host/no-repack, no operation/KV offload or context shift. High/deepseek reasoning and generation/reasoning remain uncapped.
- Previous CPU cache768/1dadee62b container is stopped and retained as the immediate rollback. SIMD/cache256, original Inkling and Gemma remain stopped. No boot/global-default changes or unrelated restoration.

## Qualification

| Check | Result |
|---|---|
| Clean pinned CPU build, embedded UI | PASS; actual4GiB/swap0/2CPU build limits |
| Offline CTests | 92/92 PASS; eight existing offline-filter patterns excluded; fresh context suite run separately |
| Fresh context fixtures | 142/142 models PASS; historical cached fixtures preserved |
| IQ4_NL SIMD | 4608 exact dot comparisons; VNNI disassembly retained |
| New-runtime trained CPU replay | 1600464 finite logits, 6401856 bytes; byte-identical to accepted SIMD4/16 baseline |
| Native replay workload | 512 prompt,64 teacher-forced steps,two observations plus existing warmup; no performance claim |
| Actual native caps | 24964497408bytes,swap0,cpu.max1600000/100000 |
| Full backing/non-model RSS guard | Maximum 22173386304bytes, including256MiB supervision; host reserve >=2GiB; GPU bytes0 |
| API | add19+23/tool result42, prefix215, actual-delta cancellation, drain and natural-EOG READY |
| Long cache revisit | 2089 reused tokens/4 evaluated; uncapped READY |
| Embedded UI/browser | Original HTML bytes; real UI chat OK, separated reasoning,natural stop,no output cap |
| CPU vision | Red/blue counterbalanced images PASS |
| Recovery | Exact cache768 parent rollback PASS; same candidate container restarted with a different PID; final READY/native/profile checks PASS |

[Accepted receipt](accepted.json), [native comparison](native-qualified.json), [resources](resource-qualified.json), [browser capture](browser-chat.png), [raw evidence](raw-evidence.tar.gz).

Native crash respawn, a populated64K context and broad coding/visual quality were not tested. GPU quality/serving,CUDA and Metal remain unqualified. The earlier cache ABBA and GPU placement measurements were not repeated.

## First controller failure and reuse

The first controller exited143 because its contention check rejected the owned private-Podman sibling cgroup. The native replay completed with exit0 and all expected frames before exact parent recovery (exit0). Both controller outcomes and frozen scripts are retained. The serving-only retry reused that completed replay and the same immutable build. Its ownership check recognises only the exact parent/candidate container IDs, including siblings; eight positive/negative ownership tests and the final live controller pass. No valid replay arm was repeated.

## Prior-feature reuse checklist

- [x] Feature: wide-LUT IQ4_NL SIMD and strict4/16 pools.
  - Source: 1dadee62b and the accepted SIMD/cache768 profile.
  - Applicability: unchanged measured CPU winner.
  - Status: applied.
  - Implementation: new pinned CPU closure and inherited launch arguments.
  - Evidence: exact dot probes,full-vocabulary replay and exact argv checks.
- [x] Feature: embedded UI and workspace path/build wrappers.
  - Source: scripts/agent-build.sh,scripts/agent-paths.sh and the accepted serving harness.
  - Applicability: required build/UI/path defaults.
  - Status: applied.
  - Implementation: make agent-paths/build/test; UI/prebuilt ON,Vulkan OFF for this CPU build.
  - Evidence: build logs,original HTML comparison and live browser completion.
- [x] Feature: bounded cache768/checkpoints and uncapped API/vision.
  - Source: 6543c98c1; inkling-cache-serving-20261121-1dadee62b helpers.
  - Applicability: accepted serving profile.
  - Status: adapted.
  - Implementation: copied helpers in a fresh namespace; only runtime/container/receipt paths change.
  - Evidence: exact argv,2089-token revisit,tools,cancellation,images and browser checks.
- [x] Feature: full-backing/RSS reserve guard and retained-container rollback.
  - Source: accepted guard.sh,unit-start.sh,rollback.sh and cutover.sh.
  - Applicability: serial model ownership and exact recovery.
  - Status: adapted.
  - Implementation: unchanged memory guard; exact previous cache768 rollback; exact-ID sibling ownership check.
  - Evidence: resource CSVs,ownership8,explicit rollback and retained-child restart.
- [x] Feature: Vulkan expert placement/shared CPU views.
  - Source: f07f44b9e,fea919c6d and the retained GPU research reports.
  - Applicability: GPU paths are outside this CPU cutover; CPU_Mapped backing does not meet the Vulkan-owned CPU-view contract.
  - Status: not applicable.
  - Implementation: GPU remains disabled; fixes remain in source.
  - Evidence: CPU-only build/argv/zero DRM clients; prior scoped GPU tests remain separate from serving qualification.

## Recovery and evidence

For deliberate rollback, first wait for idle slots, stop `inkling2-mini-prod-webui-20261122.service`, then run `/var/home/agent/workspace/tmp/llama-cpp/runs/inkling-prod-serving-20261122-c0dad48a5/rollback.sh`. It restores the exact previous cache768 container/runtime, checks native caps,argv,HTML and READY. Do not rerun either one-shot cutover controller.

Raw build/replay/first-controller inputs: `/var/home/agent/workspace/tmp/llama-cpp/runs/inkling-prod-20261122-c0dad48a5`. Serving-only retry: `/var/home/agent/workspace/tmp/llama-cpp/runs/inkling-prod-serving-20261122-c0dad48a5`. The archive retains snapshots of both namespaces,exact reference/candidate logits,full test logs,frozen manifests and recovery evidence; it excludes executables,weights,build caches and the unrelated primary patch. Live guards continue after the snapshot. The owner fork's requested `main` is a fast-forward target; its default `master` is not renamed or changed by this publication.
