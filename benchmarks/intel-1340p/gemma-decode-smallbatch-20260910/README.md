# Deployed Gemma small-target-batch decode

> Historical deployment snapshot (10-11 September 2026). The [15 September in-process zero-copy service](../gemma-zero-copy-service-20260915/README.md) supersedes the service identity, ports, active flags and rollback targets below. Commands in this snapshot are not current operating procedures.

Eight flagoff/on counterbalanced64K runs:7.3035 ->8.5099tok/s (+16.52%),largeprefill neutral,finite64K/native tools/cache passed. Qualified and deployed immutable20260910-smallbatch. Read report.md for exact scope, limits and rollback.

Run `bash verify-offline.sh` inside the fork checkout with Bun. It reconstructs the excluded source fromabdbeadfb, applies the patch, verifies its measured hash and reruns the audit/tests without inference. The compiler script requires retained matching build objects and a Fedora toolchain; source reconstruction alone does not recreate the measured whole runtime. See sibling gemma-decode-profile-20260910 for the independent profiling/configscreen that identified this change.

Model/runtimebinaries,KVstates,baselineenvironment/releaseconfigs andprivateuserdata areexcluded. Historicalmaintenance scripts mustnotbe runagainstnewerproductionwithout updatingtheirbaseline/rollback.
