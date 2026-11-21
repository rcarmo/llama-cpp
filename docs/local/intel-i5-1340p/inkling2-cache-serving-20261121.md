# Inkling 2 Mini cache768 on Sigma, 21 November 2026

Inkling 2 Mini serves at http://192.168.1.70:11434/ with the verified SIMD 1dadee62b runtime, 4/16 strict pools and 768 MiB bounded prompt cache. The accepted cache256 parent remains an immutable stopped rollback. Original Inkling and Gemma stay stopped. No push or boot changes.

[Counterbalanced measurements, exact configuration and qualification receipts](../../../benchmarks/intel-1340p/inkling2-cache-serving-20261121/README.md).

Only `--cache-ram 256 -> 768` changes. The retained long conversation needs about 559 MiB including checkpoints, so the old limit skipped it. Fresh-server ABBA reproduced 2089 cached/4 evaluated tokens instead of 2093 evaluated tokens after displacement, with natural-EOG READY. Median revisit 103.322 -> 11.815 seconds; median cold/displace/revisit 213.064 -> 120.983 seconds. Two observations per profile/step. This is cache reuse, not a SIMD/decode-speed claim.

Native23.25GiB/zero-swap/16CPU limits and the separate full-backing/RSS/2GiB-reserve guard remain active. Embedded UI,CPU Q8 vision,64k configured context,F16/FAoff,4/16 masks0x55/0xffff,reasoning and unlimited generation/reasoning are unchanged. API/tools/cache/cancel/recovery,browser,two images,explicit parent rollback and retained-child restart passed.

Current unit/container: inkling2-mini-cache768-webui-20261121 (transient,Restart=no). For deliberate rollback, wait until slots are idle, stop that unit, then run rollback.sh from tmp/llama-cpp/runs/inkling-cache-serving-20261121-1dadee62b. It restores inkling2-mini-simd-webui-20261121/cache256 and checks identity,limits,UI,argv and READY. Do not rerun one-shot cutover scripts. Native crash respawn and populated64K remain unqualified.

GPU diagnostics are experimental and not deployed. The old queued screen/controller was held because it restores cache256; adapt its parent before resuming. Preserve all source/model/closure/failure evidence. Global model defaults are unchanged.
