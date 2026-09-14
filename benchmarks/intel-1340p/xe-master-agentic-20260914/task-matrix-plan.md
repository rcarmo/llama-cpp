# Bounded current-master task extension

The new clamp pilot passes both independent grades in9rounds,559generated/791evaluated/522drafted/385accepted tokens. It differs from the old runtime's10round572/900/549/389 work; its51.954s unit runtime is not a matched speedup. Pilot excluded from new pair timing.

Extend current-runtime coverage to the remaining two predeclared fixtures, keeping the same immutable prompts/tools/tests and10round×512 budgets. Four runs only, each with fresh exact admission:

1. `master-median-on0`, median,Q6 ON
2. `master-median-off0`, median,Q6 OFF
3. `master-defaults-off0`, defaults,Q6 OFF
4. `master-defaults-on0`, defaults,Q6 ON

Same current CPU/native/O3Vulkan binaries and frozen source hashes as the pilot. Only Q6 flag differs within each fixture pair. Both use allocation-batched shared handoff,initialGPU then persistentCPU,MTP3,16GiB max/ZERO swap/reserve6GiB,600sdeadline,256MiBfixedsandbox tools. No source/interface/sampling/fixture repair during this matrix;preserve completed original campaign and all new failures.

Score independent repair/follow-up grades first and final artifacts separately when the model reaches its budget. Exact per-round prompt/rawoutput/finalsource and token/MTP work are required for causal timing interpretation within each current-runtime pair. If work differs, report noncomparable rather than silently normalising. One pair per task is a narrow diagnostic, not confidence intervals or default-promotion evidence. Existing Q6 opt-in stays unchanged regardless of noisy single-pair timing.

Finish after these four attempts plus the completed pilot; do not chase successes with extra unchanged retries. Resource/harness failures may need a separately justified corrective attempt, preserving originals. Publish current-runtime identity,task outcomes,matched/nonmatched timings and retained limitations;commit/push tested evidence. No services/deployment/new optimisation candidates.
