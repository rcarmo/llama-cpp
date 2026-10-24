# Sigma model-serving status - updated 24 October 2026

ThinkingCap Gemma 4 is the only active model server, with user authorisation. It replaced the temporary Flint UI. Endpoint:`http://192.168.1.70:11434/`, container`thinkingcap-gemma4-p8-webui`, alias `ThinkingCap-Gemma4`, physical context 65536, CPU 8P-SMT/16 prefill, F16KV, FAoff, mmap/no_host/no repack. Output/reasoning budgets are unlimited; no context shifting. The guard uses available RAM minus 2 GiB and zero swap. Boot startup is disabled. HTML and a natural-EOG SSE READY response passed.

[ThinkingCap and five-model comparison](thinkingcap-gemma4-20261024.md) records the frozen 4P coding 6/6,1,053 assertions, the separate 8P replay confirmation and the new comparison limits. Historical Flint also passed 6/6 and 1,053 assertions. BaseGemma 4, Qwen 3.6 andNemotron weights are verified comparison assets; none is a running or boot-enabled service. No new coding-quality result exists for those three.

## Removal on 23 October

At the user's request,14 model/transcription service or socket definitions and 118 installed runtime/launcher files(689711503 bytes) were removed. The exitednemotron-zc-pipeline container was also removed. Source, weights, reports, transcription data and retained configurations were preserved. The later source merge restored no service. Removal receipts remain in workspace reports/model-server-removal-20261023/.

The authorised Flint and ThinkingCap trials happened after that removal. Older Gemma, Maple, Ornith, Qwen andNemotron runbooks retain historical instructions; do not run their startup or rollback commands automatically. The new ThinkingCap rollback preserves its original 4P container and changes no old service or transcription state.

## Earlier evidence

[Flint throughput and handoff](flint-throughput-20261023.md) retains the initial 1024-token calibration failures separately from the [completed uncapped coding](../../../benchmarks/intel-1340p/flint-zero-copy-20261023/coding-unlimited/README.md). Earlier Nemotron model-quality qualification is incomplete; its historical experimental handoff/sampler tests and the retained Qwen service implementation do not establish a deployment. Further service changes require authorisation.
