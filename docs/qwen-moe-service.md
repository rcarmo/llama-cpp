# Default Qwen MoE service

The default Sigma service is Qwen3.6-35B-A3B UD-Q2_K_XL on the CPU, with lookup disabled. The guarded sorted-vector cache, request lifecycle fixes, phase profiling, suffix-only token append and configurable n-gram draft cap are available in the primary source. Their availability does not establish a general Qwen response-time improvement.

## Runtime

`tools/run-qwen-moe-service.sh` loads the pinned runtime at `~/.local/lib/llama-qwen-moe/current`. The symlink points to a revision-named installation, with source/build identity and binary hashes beside it. The live service does not execute build-directory binaries. The previous candidate runtime is retained for rollback.

`tools/systemd/user/llama-qwen-moe.service` is a user-unit template for this host. Copy it to `~/.config/systemd/user/`, set `QWEN_HOST` in `~/.config/llama-qwen-moe/service.env`, then reload/enable the unit under an approved maintenance window. Binding to a LAN address exposes an unauthenticated HTTP endpoint; use only on the trusted LAN or add a separate access control layer.

Selected settings:8decode/16prefill threads,F16KV,automatic Flash Attention,8704allocated context,one slot,reasoningoff,plain decoding. Populated8192tokens plus generation margin were tested; larger populated capacity is not qualified. Optional `QWEN_PROFILE=mtp` uses embedded depth3MTP, which passed serving smoke but was not a confirmed whole-workload winner. `--spec-ngram-cache-n-max` keeps its default8; caps1/2 and automatic lookup were not adopted.

Unit limits:16GiB memory,swap0,CPUQuota1600%,256tasks. RSS and cgroup accounting differ for shared mmap model pages. These caps do not reserve host memory or enforce speech/LLM admission; check available memory and competing native work before large requests. Stop experimental work on live requests or <6GiB available. Two simultaneous requests were checked behind one slot; many-client capacity and hours-long pressure are not qualified.

## Evidence and limits

On a fresh24-token chat with Gemma off, first content was0.790s and67output tokens completed in6.385s at11.80tokens/s. This is one measurement. Three4Kprefill comparisons measured100.662s median at8threads versus81.714s at16threads (18.8% lower prefill time); this gain is a thread-setting change.

Model evaluation dominates. The profiling change separates lookup bookkeeping from target-batch composition and replay outcome counts; exact rejected-token compute time cannot be separated from shared batch execution. Copy elimination reduced4Kbookkeeping1.282ms to0.988ms with unchanged proposals/tokens, while generation/verification took about10.6s. Short draft caps reduce rejected rows but trade away successful batch amortisation. See [lookup phase measurements](../benchmarks/qwen-lookup-phases-20260930/README.md).

Regressions cover duplicate/legacy cache contents, sorted tie semantics, new request reset, boundary-crossing incremental counts, prefix rewrite, rollback/context shift, sequence isolation and draft limits. Same-server output/counters, chat/tool roundtrips and cancel/retry were tested. Long-prefill cancellation took about20s to drain; it is cooperative, not immediate. Output can differ between speculative and ordinary decoding; broad semantic quality equivalence is unverified.

## Operation and rollback

Use `systemctl --user status llama-qwen-moe.service` and `/health`, `/v1/models`, `/slots` for service metadata. A running unit alone is not a health check. `current/SOURCE.txt` and `current/SHA256SUMS` identify the deployed code/libraries.

For Qwen-only rollback, stop the idle new unit, restore the retained runtime symlink/unit, start it, and verify model alias/chat/slots. Gemma and its LAN socket/proxy stay disabled/off: the user explicitly requested no automatic Gemma restoration. Do not enable conflicting old Qwen/Gemma units. Preserve model files, runtime directories and speech state.
