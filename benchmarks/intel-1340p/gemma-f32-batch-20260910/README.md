# FP32 attention microbatch interaction, 10 September 2026

Eight ABBA/BAAB saved64K tails:FP32+1024 improves prefill7.11% versusFP32+256. Onefresh64663-token hybridrequest reversesranking:715.246s versus691.385s (+3.45% slower,temporalcomparison). FiniteKV/nativeCPU256handoff/recall/append pass. Originalproductionrestoredunchanged;no deployment.

Read [report.md](report.md) for raw observations, failedpreflight, limits and resources. Run `bash verify-offline.sh` with Bun to check hashes, seven audit tests and raw tail/full64/restoration evidence without inference. Native runner needs retainedruntime/models and explicitmaintenanceapproval. Selector runtime/source comes from sibling gemma-gpu-attention-20260910 checkpoint0bdd7cd8b; converter fromgemma-context-coding-20260910. No newbuild or split-Kchange.

Models, runtimebinaries, largeslotstates, baselineenvironmentfiles, secrets and privateuser/speechdata are excluded. Livefilehashes and safeconfigurationcomparison remain inruntime-provenance.json/restoration-identity.json. KeepGPU256forwholeprefill;1024istail-onlyconditionalopportunity.
