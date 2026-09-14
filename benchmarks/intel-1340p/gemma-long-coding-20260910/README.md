# Long-context coding selector evidence, 10 September 2026

One ABBA block at38666 initialtokens:FP32 selection reduces median GPU prefill2.09% and summed request-route latency1.99%; allfour tasks pass with213 outputtokens/fourrounds. WarmCPUchange0.56% faster, not a decode claim. Original service restored unchanged; no deployment.

Read [report.md](report.md) for timing boundaries, source identity, review and resource evidence. Run `bash verify-offline.sh` with Bun installed to check hashes, six audit tests and allfour rawresults/restoration checks without inference. The native runner depends on retainedCPU/model/runtime, the sibling gemma-context-coding-20260910 converter, and the selector/runtime from gemma-gpu-attention-20260910 checkpoint0bdd7cd8b. No newkernelbuild was made.

Model-generated median source is synthetic test evidence. Do not treat generated code as trusted infrastructure. Runtimebinaries, models, slotstates, baselineenvironmentfiles, secrets and privateuser/speechdata are excluded. Configcomparison and live mapped-file hashes are retained in restoration-identity.json and runtime-provenance.json.
