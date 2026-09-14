# Iris Xe attention selector evidence, 10 September 2026

Experimental only. FP32 selection reduced confirmed 64K-tail prefill by 8.10%; one fresh64K hybrid request took691.385s versus746.817s (-7.42%, temporal comparison). Native controls pass6/6 versus4/6 baseline. Smaller tiles were slower. Production CPU service was restored unchanged; no deployment.

Read [report.md](report.md) for exact scope, failures, resources and remaining qualification. Run `bash verify-offline.sh` from this directory inside the fork checkout. Requires Bun and Git, but no model or inference. It reconstructs excluded Vulkan host source from4e9740248, applies the isolated patch and checks its measured source hash, then runs tests and the raw-evidence audit.

The build scripts are historical machine-local commands and require the retained Vulkan build/shader objects. Reconstructing the host selector does not recreate the complete measured runtime. Earlier softmax and compact-SWA dependencies are retained in the sibling gemma-hybrid-perf-20260910 and gemma-context-coding-20260910 exports. Runtime, model and KV files are excluded; mapped runtime hashes are in runtime-provenance.json. Baseline service files are excluded; restoration-identity.json retains comparison hashes and safe argv.

Model-generated code, where present, is synthetic benchmark evidence. Do not treat it as trusted executable infrastructure. Slot fixtures, speech media, transcripts, secrets and private user data are not exported.
