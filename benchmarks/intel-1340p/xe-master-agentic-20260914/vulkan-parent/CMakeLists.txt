cmake_minimum_required(VERSION 3.19)
project(xe_current_vulkan LANGUAGES C CXX)
# Mirror llama.cpp embedding ggml, avoiding its unavailable standalone pkg-config template.
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin")
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin")
add_subdirectory("${CMAKE_CURRENT_SOURCE_DIR}/../vulkan-source/ggml" ggml)
# Bound compiler AST memory for the generated constant byte arrays; no shader byte changes.
include("${CMAKE_CURRENT_SOURCE_DIR}/../embedded-mul-mm/sources.cmake")
