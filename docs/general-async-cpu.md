# Generalized asynchronous CPU splits (experimental)

The opt-in `--sched-async-cpu` implementation no longer relies on cold-expert
names. It permits supported arithmetic/projection splits to run on one bounded
CPU worker. Unsupported operations, evaluation callbacks and expert prefetch
retain serialized execution.

Safety rules include nested-view and physical-storage alias checks for reads,
writes and input-copy destinations. Earlier backend submissions are drained
before a CPU job starts. Later independent device splits may proceed, but join
before RAW, WAR or WAW hazards. Scope-exit draining protects graph lifetime on
error paths. Device splits are separated before consumers of the latest CPU
split so independent prefixes need not wait for their later join.

The operation allowlist is deliberately conservative. This is not a general
out-of-order graph executor. Synchronization and hazard scanning can outweigh
any overlap. The profiler's `unjoined` time is NOT measured GPU overlap.

## Validation so far

- Six CPU tests: separate-backend concurrent execution, forced worker, nested
  views/in-place writes, allocator reuse, injected CPU/device-side failure and
  recovery. Reset and teardown are exercised. A routed `MUL_MAT_ID` fixture
  checks repeated/nonadjacent expert selection against a scalar reference.
- CPU/CUDA synthetic correctness passes, including CUDA graph reuse.
- Nsight Systems with node-level CUDA graph tracing and NVTX CPU-compute ranges
  measured 33 overlapping kernels / 0.990 ms cumulative overlap in async mode,
  versus zero overlap in sync mode. This proves simultaneous device/CPU compute
  in the fixture, not a throughput improvement. GPU profiling disables the 5 ms
  artificial delay used to observe concurrency in CPU-only tests.
- Qwen3.8 27B UD-Q4_K_XL, 4K context, 39 GPU layers, four CPU threads:
  forcing FFN gate weights in blocks 60–63 to CPU exposes independent CUDA up
  projections. Trace shows no join at each up projection and a join at SwiGLU.
- Exact 64-token sync/async parity passed at that placement, both without and
  with embedded MTP depth one.
- Streaming cancellation followed by another request and health check passed.

## Performance: no deployment recommendation

On the RTX 3060 host, gate placement measured 4.24–4.28 tok/s synchronous versus
4.13–4.18 tok/s asynchronous. An MTP sample measured 5.96 versus 5.77 tok/s.
These small samples do not establish a general performance regression, but they
provide no evidence of a gain. Production remains on the unchanged default-off
scheduler. Actual GPU kernel overlap is established only by the synthetic NVTX/CUPTI
trace, not by the host scheduler trace or these Qwen throughput samples.

Remaining validation includes existing MoE-model regression, device-timeline
profiling on full models, and broader placement/workload sweeps. The production MoE artifact
is absent locally; its regression must not be claimed from the dense tests.
