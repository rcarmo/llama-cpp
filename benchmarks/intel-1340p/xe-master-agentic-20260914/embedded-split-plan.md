# Bounded compilation of embedded shader arrays

Retry r1 generated all182 shader groups/1478SPIR-V files, then failed compiling `mul_mm.comp.cpp` at2GiB. The file is87,374,277 bytes of declarations for545 constant byte arrays, not executable shader compilation or host logic. The O3 host backend object already exists. Simply lowering optimisation may not solve Clang's large initializer AST memory.

Keep the same memory cap and split only this generated data translation unit at complete declarations. `split-embedded-shaders.ts` verifies full grammar coverage, unique symbols and byte-identical reassembly, producing22≤4MiB-ish source chunks (single declarations never split). Each retains the original generated extern header. Lengths, shader bytes, linkage and host/shader optimisation remain unchanged. The report-only parent marks the original generated TU header-only and adds those chunks; no production source patch.

New compile continuation requires exact `master-agentic-vulkan-build-r2` admission,≤600s2CPU2GiB/no swap/reserve6GiB,1CMakejob/1generator slot. Preserve r1 log, partial manifest and original generated source. Reuse only current-source r1 generated/object outputs, never the pre-merge binaries. Check original source hash and chunk hashes before/after; if CMake regeneration changes embedding order/bytes, stop and diagnose. After linking, verify all545 embedded symbol lengths/bytes against the generated source, not just compiler exit status.

No GPU devices/models/native inference/tests/services/network. Resource/timeout failures retained; no cap increase or automatic repeated admission.
