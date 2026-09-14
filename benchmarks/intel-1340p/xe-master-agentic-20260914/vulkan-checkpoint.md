# Current-source O3 Vulkan plugin built

The fresh current-master Vulkan plugin is built at SHA256 `41878681e9dbd86a79a383d8655113a3e2d276d7fae4936ea667f82fef988bd3`; host object `95d66788b80c56dee897e17d657351ab66e3976d8a33f664b0e56d7691e06743`. It has not yet executed a GPU graph.

Source snapshot is committed ggml at132706928, with only the build-time generator concurrency changed from min(16,hardware concurrency) to1. All182 shader source files are byte-identical. Current glslc freshly generated1478SPIR-V files; old pre-merge shader objects were not reused. O3 host optimisation and shader math/dispatch policy remain unchanged.

## Retained attempts

1. `master-agentic-vulkan-build`: standalone configuration failed because ggml.pc.in is absent in the fork. Vulkan/glslc/SPIRV packages were present. No target build; cache/log retained.
2. `master-agentic-vulkan-build-r1`: parent-project configure succeeded; full generation completed; step322/388 compiled87,374,277-byte constant-array TU mul_mm.comp.cpp and hit2GiB cgroup OOM. Exit137,swap0,oneOOMkill.1789partial source/object hashes retained, all workers drained.
3. `master-agentic-vulkan-build-r2`: report-only CMake split of that generated TU into22 bounded files. Each contains complete declarations and same extern header. Originalsource reassembly is exact,545unique arrays. O3 compile/link passes with348,938,240B peak,swap/events/throttle0;1CMakejob/1generator slot;18reserve samples,minavailable28,485,632KiB. All compiler/container/render-device holders drained.

The post-link verifier reads ELF sections and symbols without dlopen or executing the plugin: all545 lengths and20,211,776 embedded shader bytes exactly match the original generated source.1661final generated/plugin hashes are retained. This split only limits compiler AST memory; it is not a shader optimisation or performance result.

A separately admitted synthetic GPU check must prove actual fresh-plugin loading,cached/coherent aliases,rollback,source/model lifetime and exact CPU continuation. The trained fresh-master agentic pilot and broader tasks follow only after that gate. No deployment or services/default changes.
