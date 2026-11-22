# Shared expert copy fix

The route trace confirms13 missing expert IDs at layer24 and10 at layer36, same bank and same warmup/profile masks. Keep this failure; old GPU timings/argmax matches cannot qualify correctness.

Use immutable model layer metadata to detect expert tensor pointers shared across layers. Bypass both sparse MoE-cache and default expert-copy callbacks for those weights; the existing scheduler copies the entire tensor once. Unique expert weights retain the callback. Do not alter the scheduler API, model ownership, CPU cache768 or serving args. This conservative fix covers layer-shared expert banks; other reuse patterns still need review.

Prior reuse: applied existing full-tensor scheduler fallback (ggml-backend.cpp::ggml_backend_sched_copy_input); adapted model.layers pointer sharing from inkling2-loop.cpp; reused test-context-handoff fixtures and exact bounded route/API instrumentation. GPU cache/ownership remains deferred because no trained serving or quality qualification exists.

Tests: null/unrelated/unique/shared/cross-role expert pointer checks for all four expert roles in the existing handoff fixture, then default/Gemma/Qwen/Nemotron handoff controls. New4GiB/swap0/2CPU build and same native24964497408-byte/swap0/16CPU/restoration guard. One new fixed128/8 route diagnostic only; require full bank software-copy request and zero missing experts. Native timings remain non-comparative. No new placement or service deployment/push/boot.
