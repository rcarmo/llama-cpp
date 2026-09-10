# Gemma decode profile and independent batch-thread screen

Two instrumented saved64K diagnostic modes identify targetverification16.46s versusdraft1.72s. Separate8run unprofiled targetbatch8/16screen improvesmedian20.80%; it is NOT the16.52%subsequentpatchresult. See report.md and sibling gemma-decode-smallbatch-20260910.

Run `bash verify-offline.sh` with Bun to reconstruct profilephases/rawscreenresults without inference.

Model/runtimebinaries,KVstates,baselineenvironment/releaseconfigs andprivateuserdata areexcluded. Historicalmaintenance scripts mustnotbe runagainstnewerproductionwithout updatingtheirbaseline/rollback.
