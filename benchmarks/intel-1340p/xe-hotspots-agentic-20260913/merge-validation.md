# Current-master integration validation

The owner fork master advanced to `90efe9a019987074f3664da05612eee9a557b151` while this campaign ran. It contains parallel validated work and upstream source regrouping. The final push stopped before overwriting that history. Merge `7838b21fe` incorporates it into the Q6 branch without conflicts or rebase.

The Q6 helper/dispatcher and allocation handoff source bytes are unchanged by that merge. CPU/test CMake changed (including a precompiled header), so a fresh merged-tree CPU-only build and exact OFF/ON CTest were required.

`q6-merged-cmake`:43 build steps and exactly one42-case test pass with5710 bit-identical floats, SHA256 `c67cf18881a9276643408605b27bb9fa7d53c24b992f0b58eceee3692d97325b`. Test binary `81f8b7ba5fe9f6ade99620714d55d30bfe706151a8f4c33aa1b91c5f40b17859`; CPU library `021b1215964a789f7fbfde75d34861fc3025e4039357776d0d039ccce8658641`. Cgroup memory peak183,668,736 bytes, swap and memory events zero. Quota throttled14 periods/754206 microseconds; no timing inference. The newly deprecated precision setter warning and existing warnings are retained in the build log.

Compiler/test/container workers drained before both peer releases; no GPU, model, service or deployment changes. Unrelated untracked benchmark data stays intact.

The trained timing evidence identifies its retained pre-merge caller/libraries; it is not a fresh full-runtime benchmark of the advanced master. Parallel master changes include chat parsing and speculative position plumbing, outside this campaign. The Q6 integration is tested against the merged backend. Broader merged-runtime retraining/benchmarking remains outside the requested bounded campaign; exact identity manifests prevent conflating those results.

Published benchmark files are unchanged by the parallel merge and all archived-tree checks are rerun before final master push. No force push or deletion of parallel work.
