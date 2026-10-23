#!/usr/bin/env bash
# Reproduce the five focused tests for a selected BUILD_VARIANT. Requires NEMOTRON_TEST_MODEL.
set -euo pipefail
: "${BUILD_VARIANT:?set gcc-cpu or gcc-intel-vulkan}"
: "${NEMOTRON_TEST_MODEL:?set an existing GGUF path}"
source scripts/agent-paths.sh
llama_agent_init_paths
llama_agent_prepare_paths
cmake -S "$LLAMA_SOURCE_DIR" -B "$LLAMA_BUILD_DIR" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release -DCMAKE_EXPORT_COMPILE_COMMANDS=ON \
  -DNEMOTRON_TEST_MODEL="$NEMOTRON_TEST_MODEL"
cmake --build "$LLAMA_BUILD_DIR" --parallel "${JOBS:-4}" --target test-nemotron-semantic-handoff
ctest --test-dir "$LLAMA_BUILD_DIR" -R \
  '^(test-nemotron-schema-transition-predicate|test-nemotron-schema-transition-lifecycle|test-reasoning-budget|test-grammar-integration|test-json-schema-to-grammar)$' \
  --output-on-failure
"$LLAMA_BUILD_DIR/bin/test-nemotron-semantic-handoff" --test-schema-lifecycle "$NEMOTRON_TEST_MODEL"
