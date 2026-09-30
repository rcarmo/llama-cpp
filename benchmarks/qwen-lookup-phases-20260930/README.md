# Qwen lookup phase investigation, 30 September 2026

Target-model evaluation dominates this Qwen workload. Lookup bookkeeping took about 1 ms across the 4K fresh/follow-up pair, while generation and speculative verification took about 10.6 s. Removing full-prefix copies improves bookkeeping but does not materially improve response latency. Shorter drafts reduce rejected rows, with workload-dependent latency trade-offs.

## Useful commits

- `3d4591163`: opt-in `GGML_SPECULATIVE_PROFILE` phase logging. Records n-gram preparation/update/selection and request initialisation, pure target model batch composition, sampler acceptance/rejection and replay, KV trim cost. Existing enclosing timers are retained. Profiling does not change sampler/KV behavior.
- `9649b43ef`: reuses the confirmed token vector and appends only new tokens, removing temporary full-prompt construction and full-state reassignment. Exact full-prefix validation remains necessary for rewrite/rollback/context-shift correctness. The algorithm still scans the prefix; it is not O(suffix) overall.
- `82d915679`: `--spec-ngram-cache-n-max N`, default8 unchanged, accepts0..1024. Zero disables proposals, configured and runtime output bounds agree. CLI/parser/lifecycle/invalid-limit regressions pass.
- `a896e863e`: Bun phase parser/tests. Mixed prompt+generation batches stay explicit; counts are validated. Timing categories are not silently added across nested boundaries.

All commits are local on `fix/sorted-vector-qwen-moe`, based on the earlier guarded-vector/lifecycle fixes `f7163da15`. No push/main merge/deployment. The live LAN service still uses its older pinned plain profile with lookup off. Gemma stays off by user instruction.

## Scope and resources

Same local Qwen3.6-35B-A3B UD-Q2_K_XL model and Qwen-tokenized static cache as the preceding code A/B. Model SHA-256 in `model.sha256`. CPU-only Release/GNU16/native build, eight decode/sixteen prefill threads,F16KV,FAauto,one slot,8704context,batch1024/microbatch256. Fresh inputs1024(copy)/4096(prose),64output; cached follow32output,evaluates one token. Same warmup/static cache/request fixture. Fresh isolated network-none16CPU/8GiB no-additional-swap containers. Live Qwen remains available and trial aborts on user activity or hostavailable<6GiB. Speech owner explicitly grants/releases CPU windows. All9native pairs completed with zero swap/OOM; no service changes. Temperature/pagecache not reset. One phase screen per variant, not matched statistical confirmation.

`copies` is the correct lifecycle baseline plus phase instrumentation. `append` adds the copy elimination. `none` disables lookup using the same instrumented runtime. `cap2`/`cap1` enable the new configurable limit. Caps use a later binary with a different parameter-struct layout; runtime snapshots and hashes identify each arm. Profiling is enabled in these runs and introduces logging overhead; use unprofiled controlled confirmation before promoting a speed claim.

## Where time goes

Across the 4K fresh request and its prefix-reused follow-up, including the same zero-output warmup:

| Category | Full-copy baseline | Append-only state |
|---|---:|---:|
| N-gram draft bookkeeping | 1.282 ms | 0.988 ms |
| Preparation/copy/compare portion | 0.447 ms | 0.109 ms |
| Context update portion | 0.483 ms | 0.510 ms |
| Follower selection portion | 0.352 ms | 0.369 ms |
| Target speculative verification batches | 7,517.8 ms | 7,462.2 ms |
| Ordinary target generation batches | 3,108.3 ms | 3,115.0 ms |
| Checkpoint restores | 13 | 13 |
| Rejected verification rows over all attempts | 59 | 59 |

Token arrays, draft counts and acceptance are exactly unchanged between copy and append variants in both fixtures/phases. The saved bookkeeping preparation is about0.34ms per pair, with 0.29ms saved in total draft bookkeeping. This cannot explain a large response-time gain.

The separate model-free3000-call screen had identical draft hashes and24000proposals at each1K/8K/32K prefix. At8K total loop time averaged14.62ms baseline versus5.40ms append, and at32K36.48ms versus12.16ms; 1K noisy. These synthetic timings quantify removed copies and do not measure model inference. Two observations per arm, quota/cache/thermal variance present; preserve individual samples in `bookkeeping-results.txt`.

On repetitive1K copy, all83proposals across fresh/follow were accepted, no checkpoints/rejected rows. Lookup target verification took3.47s combined versus8.56s ordinary generation with lookup off. The 4K prose path instead has37verification batches141rows plus30ordinary generation rows,59rejected rows and13replays. With lookup off,94ordinary rows took9.65s. Thus verification/replay can cost more than the cheap draft selection saves.

`target_model` brackets `llama_decode` plus its existing synchronization, excluding later speculative process callbacks. Prompt-only batches without outputs can have synchronized=0; do not equate them to completed device timing on a GPU. This campaign is CPU-only. `target_decode`, `draft` and `process` are enclosing timers; do not sum them with nested model/ngram timers. `sample_accept.accepted` is raw accepted proposal count; `accepted_new` corrects replay accounting. Rejected counts include each verification attempt, including replays. Final response draft_n is new proposals, so attempt counts need not equal final drafted minus accepted. Model evaluation is shared across accepted/rejected rows; per-rejected-token compute time is not measured.

## Draft-length screen

| Prose4K mode | Fresh total s | Follow total s | Fresh accepted/proposed | Follow accepted/proposed | Rejected attempt rows / restores across pair |
|---|---:|---:|---:|---:|---:|
| Lookup off | 88.10 | 3.36 | 0/0 | 0/0 | 0/0 |
| Cap8, append state | 89.14 | 3.62 | 19/63 | 8/23 | 59/13 |
| Cap2 | 89.53 | 3.25 | 17/33 | 8/13 | 21/13 |
| Cap1 | 89.67 | 3.62 | 10/21 | 4/9 | 16/16 |

Cap2 cuts rejected rows while retaining identical fresh/follow prose tokens to cap8. Its follow-up is about10% faster in this one screen, but fresh total is slightly slower and its verification+ordinary-model total is10.71s versus10.58s for cap8. Cap1 changes output tokens and increases replay count. Neither is a global winner.

Copy1K: cap8 total22.04s/follow1.33s;cap2 23.04s/1.84s, identical tokens. Reducing draft length shrinks successful batch amortisation: cap8accepts56/56fresh+27/27follow;cap2accepts42/42+20/20. Verification pair model time rises from3.47s to4.76s plus one ordinary decode. Default stays8; live lookup stays off. An adaptive policy would need cost/acceptance-aware evidence, not just a rejection-rate threshold.

## Checks, failures and replication

Focused CTest4/4PASS (argument parser, ngram cache, lifecycle, grammar). Argument-parser download tests initially failed in network-none; rerun used a local HTTP fixture bound to loopback80 with ggml.ai mapped locally, network still disabled. No external download was used. ASan/UBSan build could not link missing libasan in the build image; sanitizer checks were not run. Read-only delegate audit identified timing gaps before instrumentation; a subsequent correctness review timed out and supplied no verdict.

`analyse.ts` reads logs, validates row sums/decode errors/phase counts and emits independent per-phase totals. `analyse.test.ts` has2tests/13checks. Run `bun test benchmarks/qwen-lookup-phases-20260930/analyse.test.ts` and `bun benchmarks/qwen-lookup-phases-20260930/analyse.ts SERVER-LOG ...`. `raw/` includes actual phase logs, resource snapshots and client summaries. `phase-results.json` also retains totals and output hashes. `run-profile.sh`/`run-caps.sh` take the workspace trial root as argument, require frozen runtime snapshots+recorded input/model/cache paths, and refuse result overwrite. `stream-fixture.py` records actual SSE first-content timing and output tokens. Model/corpus/cache/binaries are excluded from this commit.

Next useful experiment: predict whether verifying another draft token is cheaper than another ordinary decode, using observed acceptance plus checkpoint/replay costs. Preserve prefix ownership and exact cache correctness, compare fixed output budgets and report any changed continuation. No adaptive routing or global default was introduced by this investigation.
