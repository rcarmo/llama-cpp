# Inkling 2 Mini cache768 on Sigma, 21 November 2026

Inkling 2 Mini serves at http://192.168.1.70:11434/ from the verified c0dad48a5 CPU runtime, with unchanged 4/16 strict pools and 768 MiB bounded prompt cache. The previous cache768/1dadee62b container is the stopped immediate rollback; cache256,original Inkling and Gemma also stay stopped. No boot/global-default changes. [22 November production qualification and recovery](../../../benchmarks/intel-1340p/inkling2-cache-serving-20261121/production-20261122/README.md).

[Counterbalanced measurements, exact configuration and qualification receipts](../../../benchmarks/intel-1340p/inkling2-cache-serving-20261121/README.md).

The 21 November cache adoption changed only `--cache-ram 256 -> 768`. The retained long conversation needs about 559 MiB including checkpoints, so the old limit skipped it. Fresh-server ABBA reproduced 2089 cached/4 evaluated tokens instead of 2093 evaluated tokens after displacement, with natural-EOG READY. Median revisit 103.322 -> 11.815 seconds; median cold/displace/revisit 213.064 -> 120.983 seconds. Two observations per profile/step. This is cache reuse, not a SIMD/decode-speed claim.

Native23.25GiB/zero-swap/16CPU limits and the separate full-backing/RSS/2GiB-reserve guard remain active. Embedded UI,CPU Q8 vision,64k configured context,F16/FAoff,4/16 masks0x55/0xffff,reasoning and unlimited generation/reasoning are unchanged. API/tools/cache/cancel/recovery,browser,two images,explicit parent rollback and retained-child restart passed.

Current unit/container: inkling2-mini-prod-webui-20261122 (transient,Restart=no). For deliberate rollback, wait for idle slots, stop that unit, then run rollback.sh from tmp/llama-cpp/runs/inkling-prod-serving-20261122-c0dad48a5. It restores the exact prior cache768/1dadee62b container and checks identity,limits,UI,argv and READY. Do not rerun one-shot cutover scripts. Native crash respawn and populated64K remain unqualified.

GPU diagnostics are experimental and not deployed. The old queued screen/controller was held because it restores cache256; adapt its parent before resuming. Preserve all source/model/closure/failure evidence. Global model defaults are unchanged.

## GPU follow-up, 21 November 2026

The new cache768-targeted controllers completed two profiler-off placement screens and restored the accepted CPU service. Expert-group and dense-attention prefill were 23.24% and 16.54% slower respectively at 512/64 (two observations each, no counterbalanced conclusion). [Evidence and retained opportunities](../../../benchmarks/intel-1340p/inkling2-cache-serving-20261121/gpu-research/README.md). No GPU serving/default/push/boot change.


## Copy/dispatch follow-up, 22 November

The [bounded diagnostic](../../../benchmarks/intel-1340p/inkling2-cache-serving-20261121/gpu-research/copy-dispatch-20261122/findings.md) spends5.069s in CPU backend calls and0.058s in copy/wait wrappers within5.402s of instrumented128-token prefill. No profiler-off speedup is inferred. Zero-cache still uses the expert-copy callback:146,324,992bytes/23ranges/98of128experts, not the entire191,102,976-byte bank. Later shared-loop route coverage is the next correctness gate. The logger-only fix and tests are retained locally; temporary scheduler hooks were removed. Exact cache768/native caps/API recovery passed; serving defaults and immutable binaries remain unchanged.


## Shared expert-bank correction, 22 November

[Routing evidence](../../../benchmarks/intel-1340p/inkling2-cache-serving-20261121/gpu-research/shared-bank-coverage-20261122/findings.md) found13/10 unuploaded experts at later loop visits. Local source fix fea919c6d disables sparse copying for model expert tensors shared across layers; the existing full copy covers all128experts. Scoped tests and fixed128/8 coverage pass; broad GPU quality/serving remain unqualified. The live cache768 CPU/SIMD runtime and budgets are unchanged. Next target: retained CPU Q8_0/graph cost evidence, not another unchanged placement sweep.


## CPU production rebuild, 22 November

The [new immutable CPU runtime](../../../benchmarks/intel-1340p/inkling2-cache-serving-20261121/production-20261122/README.md) passed92 offline CTests,fresh context142/142,4608 exact SIMD probes and1,600,464 finite logits identical to the accepted baseline. Actual native caps,tools42/prefix215,long cache2089,cancel/recovery,embedded UI/browser,red/blue images,exact cache768 rollback and retained-child restart pass. CPU4/16/cache768/model/projector/reasoning/64K remain unchanged. The first controller sibling-ownership failure and exact recovery are retained; its completed native replay was reused. GPU serving remains disabled.
