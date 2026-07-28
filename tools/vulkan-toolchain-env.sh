#!/usr/bin/env bash
# Source this file to use the workspace-local Vulkan shader/tooling packages.
_vulkan_prefix=${VULKAN_LOCAL_PREFIX:-/workspace/.local/vulkan-toolchain/usr}
export PATH="$_vulkan_prefix/bin:$PATH"
export LD_LIBRARY_PATH="$_vulkan_prefix/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}"
export CMAKE_PREFIX_PATH="$_vulkan_prefix:${CMAKE_PREFIX_PATH:-}"
export CMAKE_INCLUDE_PATH="$_vulkan_prefix/include:${CMAKE_INCLUDE_PATH:-}"
export CPLUS_INCLUDE_PATH="$_vulkan_prefix/include:${CPLUS_INCLUDE_PATH:-}"
export C_INCLUDE_PATH="$_vulkan_prefix/include:${C_INCLUDE_PATH:-}"
export Vulkan_GLSLC_EXECUTABLE="$_vulkan_prefix/bin/glslc"
unset _vulkan_prefix
