# Longer64K coding decode evidence

Two separate four-run ABBA blocks compare the same patched CPU runtime with the smallbatchflag off/on. Original640-token module outputs:23.34% higherdecode;allfour truncated. Compact321-token repair outputs:23.95% higherdecode;allfour wrongexportname. Code and output/draftcounts identical within eachblock. No exacttaskpasses. A single importalias diagnostic passes16behaviourtests withoutchangingcode and does notchange originalacceptance.

Read report.md for boundaries and failures. Run `bash verify-offline.sh` with Bun to check hashes and fiveaudit/extractiontests, then reconstructrawtimings/restorationchecks. It runs neither inference nor generatedcandidate code. Generated source under sandbox/ is untrusted benchmarkevidence, not infrastructure. Do not execute it on the host.

Runtimehash references sibling gemma-decode-smallbatch-20260910 and patchcheckpoint4104e7827. No newbuild/deployment; current20260910-smallbatchhybridrestoredunchanged. Baselineprivateconfig, models andlargeKVstatesexcluded. Historicalmaintenance scripts neednewbaseline/clearance before reuse.
