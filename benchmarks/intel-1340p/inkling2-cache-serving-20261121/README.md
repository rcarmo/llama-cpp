# Inkling 2 Mini cache768 adoption, 21 November 2026

Inkling 2 Mini is live at http://192.168.1.70:11434/ with the accepted SIMD/four-thread runtime and a 768 MiB prompt cache. Only `--cache-ram 256 -> 768` changes. The same immutable binary/library closure, embedded UI, official IQ4_NL model, CPU Q8 vision and all other server arguments are preserved. GPU offload is not deployed. No push, boot change or unrelated service restoration occurred.

## Counterbalanced cache result

Fresh-server ABBA used two observations/profile/step. Each workflow sends the retained 2048-content-token code prompt, a dissimilar short request that displaces the conversation, then revisits the original prompt. Deterministic API probes use temperature 0 and natural-EOG READY, with no output or reasoning cap. All rendered cold/displace/revisit fingerprints match. This is a cached-revisit latency improvement, not a decode-throughput gain.

| Profile | Median cold/displace/revisit seconds | Median revisit seconds | Revisit evaluated tokens |
|---|---:|---:|---:|
| cache256MiB | 213.064 | 103.322 | 2093 |
| cache768MiB | 120.983 | 11.815 | 4 |

Median revisit latency fell 88.57%; the three-request workflow fell 43.22%. Both candidate arms reused 2089 tokens and generated the same 82-token natural response length as the controls. Cold medians were 103.664and102.918seconds respectively.

| Arm, ABBA order | Cache MiB | Reused tokens | Evaluated tokens | Generated tokens | Revisit seconds |
|---|---:|---:|---:|---:|---:|
| cap-a1 | 256 | 0 | 2093 | 82 | 103.002 |
| cap-b1 | 768 | 2089 | 4 | 82 | 11.863 |
| cap-b2 | 768 | 2089 | 4 | 82 | 11.766 |
| cap-a2 | 256 | 0 | 2093 | 82 | 103.642 |

[Full validator output](capacity-qualified.json) and [per-request CSV](capacity-results.csv) include the recovery requests, memory/swap observations and fixture fingerprints. Real-delta cancellation, idle drain and READY recovery passed on every arm. The full saved conversation occupies about 558.973 MiB including checkpoints, so 256 and 512 MiB limits rejected it. The earlier spacing 512/cache 512 screens did not reduce evaluated tokens and are retained in the raw experimental directory. The768 MiB candidate changes capacity alone; checkpoint spacing stays 8192 and checkpoint count stays 2.

## Production qualification

- Live tools returned 42, reused 215 prefix tokens and passed cancellation/drain/READY recovery. [API receipt](api-verification.json).
- The production endpoint passed the same long displacement/revisit fixture: 2089 cached tokens, 4 evaluated tokens, natural READY. [Live cache results](qualification-cache.warm-results.json).
- Real browser chat returned OK with separate reasoning and natural stop, without browser errors or output-token caps. Decoded parent/candidate HTML bytes match. [Browser receipt](browser-chat.json).
- Two swapped-colour images returned red/blue with identical prompts. [Vision receipt](vision-verification.json). Broad visual quality is untested.
- Explicit rollback restored the exact accepted SIMD4/16/cache256 parent, verified its CLI, native limits, UI and READY forward response. The cache768 child then restarted with the same container ID and a new PID. Final READY, native/profile and integrity checks passed. [Cutover log](qualifier.log), [rollback](rollback-check.log), [acceptance](accepted.json).
- Actual native limits: 24,964,497,408 bytes (23.25 GiB), zero swap and `cpu.max=1600000 100000`. Full model/projector backing plus non-model RSS and supervisor allowance are guarded separately from cgroup charges; at least 2 GiB host RAM must remain available. [Live resource observations](resource-summary.json). Final OOM and CPU-throttling counters were zero.

The inherited profile remains CPU-only text/projector/state, 4 decode/16 prompt strict threads, masks 0x55/0xffff, poll 50, context 65,536/parallel 1, F16 KV/FA off, mmap/no-host/no-repack, no operation/KV offload, batch 512/ubatch 128, two checkpoints/no context shift, high/deepseek reasoning, unlimited generation/reasoning, and seed 42/temp 1/top K 50/top P 1/min P 0. [Exact profile](serving-profile.json) and [native argument check](final.profile-verification.json).

Binary source commit: `1dadee62b291391d7b6c230fa81f04a2358c6bf2`. The implementation was already merged and qualified; this adoption changes only a host-specific serving configuration. No model code or global cache default changed, so the identical qualified binary was reused without rebuilding. This commit integrates configuration, reproducible harness and evidence separately from the runtime-code identity. Runtime closure: `/var/home/agent/workspace/projects/llama-cpp/runtime/deployments/inkling2-mini-simd-1dadee62b-1fb03598f3d1`. [Library hashes](runtime.sha256).

## Operation and exclusions

Current transient unit/container: `inkling2-mini-cache768-webui-20261121`, `Restart=no`, no boot enablement. Parent `inkling2-mini-simd-webui-20261121` (cache256), original Inkling and Gemma are stopped and preserved. Wait for idle slots before a deliberate stop. Stop the cache768 unit, then use the new serving run rollback.sh to restore only the accepted SIMD/cache256 parent. Do not rerun one-shot cutover/launch scripts against existing containers. After acceptance, a nonzero child-supervisor exit attempts that parent rollback; manual stops do not. Native-crash recovery and auto-respawn were not qualified.

Configured 64K capacity has not been populated end-to-end. Broad coding/model quality, GPU serving, CUDA and Metal remain unqualified. GPU 128/8 diagnostics established finite logits and selected Vulkan routed operators, not a serving performance win. The queued GPU screen was held before native start so its old cache256 restoration controller cannot undo this deployment. Future GPU experiments must restore the new accepted cache768 parent and pass their own timing/append/cancel/fallback checks.

Raw serving state: `tmp/llama-cpp/runs/inkling-cache-serving-20261121-1dadee62b`. Raw cache/GPU evidence: `tmp/llama-cpp/runs/inkling-cache-gpu-20261121-1dadee62b`. Paths are relative to the actual workspace. The archived [harness](harness/) uses these retained host paths; inspect it before preparing a new namespace and never overwrite active launchers or repeat valid arms. [Operating note](../../../docs/local/intel-i5-1340p/inkling2-cache-serving-20261121.md).
