# Publication provenance and limits

The benchmark uses the retained runtime qualified in `xe-master-agentic-20260914`, whose source/API migration was committed as132706928. Repository HEAD at this experiment was6d6b1375a. Later documentation commits do not change the loaded binaries. Full binary hashes and model stat identities are frozen before model admission.

The source-level copied-KV control only hides `ggml_backend_vk_buffer_cpu_view` during synchronous transfer and restores the procedure table on normal/exception exit. Allocation policy,CPUthreads,MTP,Q6 and model settings remain constant; the CPU arm skipsGPUentirely.32Kallocatedcontext and557MiBlogicalpayload are not equivalent to populatedtokenbytes.

One model attempt per v2 arm was run; no reverse repetitions after task failures. Firstprompt2212tokens/output16tokens matches allthree;laterCPU/GPUtrajectoriesdiffer. Copy/shared fulltaskworkmatches,but bothfail firstindependentgrade. Thus handoff/coldstartupdiagnostics remain observable while a successful-task performance conclusion is unavailable.

The harness reference passed the finite built-in oracle suites. It is not a proof against all JavaScript inputs: for example unusual property names,locale/date parsing andaggregate-overflowbehaviour outside coveredcases have not been exhaustively qualified. Neither oraclecoverage nor a passing low-level runtime verifier should be equated with broad modelreliability. The reports retain the actual failures instead of substituting reference solutions into taskresults.

No model files,compiledlibraries,liveadmissionfiles or external private data are published. Raw logs contain only syntheticfixture/modelbenchmarkoutputs. No services or productiondefaults changed.
