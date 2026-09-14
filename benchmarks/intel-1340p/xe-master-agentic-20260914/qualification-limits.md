# Scope and limits of the resumed phase

This phase completes a bounded fresh-runtime qualification after the original campaign was merged and delivered. It is not an open-ended optimisation search.

Accepted work:

- Live in-memory caller migration to the current speculative position API, committed132706928 and tested through a fresh fullCPU/common/caller build.
- Fresh current-source Vulkan build with complete regenerated shaders. A report-only constant-array split controls compiler AST memory; its exact embedded bytes are verified. No production shader or selector change.
- CPU/vocabulary regressions, native synthetic plain/Gemma sharedhandoff and a trained persistent clamp pilot, each under separate admission.
- Exactly four current-runtime median/defaults extension runs, including failures and noncomparable timing. No extra budget retries to improve the success count.

Reported comparisons:

- Oldvsnewclamp is noncomparable for latency because prompts/output/rounds/token/MTPwork differ. Successful currentpilot is quality/lifecycle evidence only.
- Median Q6ON/OFF exact-work pair permits an exploratory within-runtime timing observation. One pair does not establish a confidence interval or broad gain.
- A round-budgetfailure remains a workflowfailure even if final code passes hidden artifact tests. Do not turn its shorter runtime into a speedup.

No production deployment,serviceconfiguration,defaultQ6activation,modelweightwrite,upstreamsubmission or unrelatedwork modification. Currentplugin is a report build from pinnedsource, not installed. Broader workloads,largercontexts,concurrency/capacity,drivercrashrecovery and servingintegration remain separate future tasks. Their absence does not invalidate the completed bounded checks and is not permission for automatic follow-on runs.

Bothoriginalandnewpreflight/buildfailuresare preserved. Checkpoint commits do not imply new admissions. Allmodels/compilers/GPUowners/tools/containers must drain before release;completedoldmatrices remain immutable.
