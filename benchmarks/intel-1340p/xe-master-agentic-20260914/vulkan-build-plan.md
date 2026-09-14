# Current-source Vulkan build

The retained plugin is unsuitable for a full merged-master claim: the Vulkan host changed and29 shader/generator files changed since the measured pre-merge snapshot. Build a new plugin from a hash-pinned source snapshot; no reuse of old generated SPIR-V or shader object files.

The current shader generator defaults to min(16,hardware_concurrency) subprocesses independently of CMake -j. For the shared-host build, make an isolated build-only snapshot edit setting that count to1, and use `cmake --build ... -j1`. Keep all shader maths, definitions and device dispatch policy byte-identical. Preserve the patch and hash both snapshot/source; no production generator change or global environment override. Compiler optimisation remains Release/O3, so the final plugin is not the diagnostic O0/O1 predecessor.

Use a separate CMake output with Vulkan ON, CPU/backend-DL OFF as appropriate for the plugin target, no apps/tools/tests/common. Target ggml-vulkan only. Fresh glslc feature probes and full generation; missing SDK/SPIRV headers is a preflight failure, not a successful build. No network/package installation during the build. If required dependencies are absent, stop and inspect rather than reuse incompatible generated sources.

Admission request: <=600s CPU,2-CPU quota,≤2GiB/no swap,1 build job/1 internal shader compile;host reserve≥6GiB. No GPU device mounts,model tensors or tests. Capture step counts,partial outputs,compiler/plugin/shader hashes,cgroup memory/events/swap,source drift and all owned descendants. On timeout/OOM preserve partial outputs and release; a continuation requires a new exact admission, not automatic retries.

After compile success, separately admit synthetic cached/coherent view + context-handoff tests using fresh CPU runtime and plugin,then trained pilot. Record actual loaded maps and shader/compiler/device identity. No services/deployment/default selector change.
