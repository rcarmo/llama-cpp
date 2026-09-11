# Static score-job scheduling: rejected

The opt-in `job = ith; job += nth` scheduler was **rejected**. On the frozen saved-64K workload it reduced median decode from **9.2790 to 8.3537 tok/s (-9.97%)** and increased median request wall time from **15.404 to 16.958 s (+10.09%)**. The exact 64K work, output token hash, and 90/110 accepted drafts matched in all four fresh-worker runs.

The real-model trace explains the risk rather than claiming a causal decomposition: eight score workers executed across CPUs 0–15, and per-thread static-job elapsed time varied by as much as 5.98×. Dynamic one-job claims compensated for that heterogeneous placement; strided static ownership did not.

Correctness and dispatch gates passed before timing: 14 structural/lease tests (178 assertions), 6/6 standalone production-sized byte-exact dynamic/static groups with once-only row ownership and canaries, 19/19 native cases in each dynamic/static × query-reuse off/on arm, and a real saved-64K trace with exact 64658 cached, 25 evaluated, 128 generated, and 90/110 accepted drafts.

Tracing was disabled for timing. Trial swap was zero, peak temperature was 77°C, and B0 was verified after every heavy stage. The B1 query-reuse combination was not screened because isolated static scheduling failed its retention gate. Nothing was deployed; GPU and near-128K work were not run.

## Other bounded branches

Cross-head key preparation is conditional-not-run: the graph/CPU backend invokes one head at a time and the local kernel has no safe shared lifetime. Q6_K resolves to the 2560×262144 `token_embd.weight` vocabulary projection; its retained n4 node wall was 0.778 s while activation preparation summed only 0.0013 thread-seconds, leaving no evidenced preparation-reuse candidate. Persistent threadpool support exists, but no removable pool-transition cost was established.

The read-only resource audit does not support a current cgroup-limit explanation for the earlier B1 staging swap: current production and all visible ancestors have unlimited `memory.high`, `memory.max`, and `memory.swap.max`. The failed transient cgroup was already collected, and retained logs lack worker stderr, GPU exit/allocation detail, or historical cgroup event deltas. Root cause therefore remains unresolved; no GPU retry or policy change was made.
