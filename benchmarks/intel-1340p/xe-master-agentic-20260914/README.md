# Fresh merged-master agentic qualification

This follow-on phase qualifies newly built current-master CPU and Vulkan code. It does not overwrite the completed [previous campaign](../xe-hotspots-agentic-20260913/README.md), whose timing evidence used retained pre-merge binaries.

Current evidence:

- [CPU checkpoint](cpu-checkpoint.md): fixed removed speculative `n_past` API in live in-memory caller to `pos0`,commit132706928 pushed;fresh153-step CPU build,4Ctests and21vocab-prefix/12mutation checks pass.
- [Vulkan checkpoint](vulkan-checkpoint.md): currentO3 plugin41878681 built from182current shader groups/1478SPIR-V files. Preserve standalone config failure and2GiB OOM;split generated constant arrays to bound compiler memory,not shader math. OfflineELF545lengths/20,211,776bytes exact.
- Fresh-plugin synthetic plain/Gemma handoff passes shared65536/196608,copy0,ownership/rollback/source-destruction and exactCPUreference;unitzero-swap and allworkerdrain verified.
- [Trained clamp pilot](pilot-results.md):9rounds,2independentgrades,warmprefixPASS. Changed output/work versus oldruntime prevents comparing walltime as speedup.
- [Completed task extension](current-results.md): median Q6 ON/OFF both pass with exact work; whole time -1.63%, warm native -1.94%, one exploratory pair. Both defaults workflows reach the round cap despite passing final artifacts: 2/4 workflows and 4/4 artifacts. No retries or qualified defaults timing.
- [Current-runtime chart](charts/current-master-tasks.svg) and [CSV data](charts/current-master-data.csv) retain task failures and the old/new clamp work mismatch.
- Final offline checks: 22 tests/109 assertions, including identity/map/swap verifier mutations. All five trained runs pass resource, lifecycle and current-runtime identity checks.

Frozenruntime manifest:agentic-freeze.json. `verify-current.ts ID` checks per-run grades/state,currentlibrary/pluginidentities,maps anddirectcgroup evidence. `compare-tasks.ts` gives timing only when within-task OFF/ON rawprompts/output/work andbothgradesmatch. Build-only scripts andabsolute identity checks need matchinglocalassets;they are not portable installers. Do notexecutehistoricaladmissions.

Published artifacts exclude executables,modelweights,generatedshaderarrays/SPIR-V andmutableadmission files. Small manifests retain hashes/rebuildrecipes. Historical outcome tests use two copied resultfixtures only;runtimefixtures remain frozen.

No deployment,service/defaultchanges,upstream submission or rewritten history. All heavy runs require fresh three-way operational admission;completed oldbenchmarksmustnot be rerun to fill this new phase.
