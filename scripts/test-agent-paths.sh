#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Check project-scoped path defaults, fallback and escape rejection","kind":"mutating","weight":"lightweight","role":"entrypoint"}
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/agent-paths.sh"
llama_agent_init_paths
base="$PROJECT_TMP_ROOT/runs/path-tests-$(git -C "$LLAMA_SOURCE_DIR" rev-parse --short=12 HEAD 2>/dev/null || echo unversioned)/$(basename "$LLAMA_SOURCE_DIR")"
mkdir -p "$base"
fixture=$(mktemp -d "$base/fixture.XXXXXX")
trap 'rm -rf -- "$fixture"' EXIT
helper=$(realpath -e "$(dirname "${BASH_SOURCE[0]}")/agent-paths.sh")
clear_paths() { unset LLAMA_BUILD_DIR LLAMA_CACHE_DIR LLAMA_RUN_DIR; }
(
    clear_paths
    llama_agent_init_paths
    [[ $TMPDIR == "$PROJECT_TMP_ROOT/runs/"* && $BUN_TMPDIR == "$TMPDIR" ]]
    [[ $LLAMA_BUILD_DIR == "$PROJECT_TMP_ROOT/build/"* && $CCACHE_DIR == "$PROJECT_TMP_ROOT/cache/"* ]]
)
(
    clear_paths
    WORKSPACE_ROOT="$fixture/absent-workspace"
    llama_agent_init_paths
    [[ $WORKSPACE_ROOT != "$fixture/absent-workspace" && -d $WORKSPACE_ROOT ]]
)
if (clear_paths; LLAMA_BUILD_DIR="$fixture/outside"; llama_agent_init_paths) 2>/dev/null; then echo 'FAIL: accepted outside build'; exit 1; fi
if (clear_paths; BUILD_VARIANT=../escape; llama_agent_init_paths) 2>/dev/null; then echo 'FAIL: accepted variant traversal'; exit 1; fi
mkdir -p "$fixture/workspace/project" "$fixture/workspace/tmp" "$fixture/redirect"
ln -s "$fixture/redirect" "$fixture/workspace/tmp/llama-cpp"
if (clear_paths; WORKSPACE_ROOT="$fixture/workspace"; LLAMA_SOURCE_DIR="$fixture/workspace/project"; llama_agent_init_paths) 2>/dev/null; then echo 'FAIL: accepted symlink project root'; exit 1; fi
mkdir -p "$fixture/standalone/project"
WORKSPACE_ROOT= LLAMA_SOURCE_DIR="$fixture/standalone/project" LLAMA_BUILD_DIR= LLAMA_CACHE_DIR= LLAMA_RUN_DIR= bash "$helper" --print > "$fixture/standalone-paths.txt"
grep -q "WORKSPACE_ROOT=$WORKSPACE_ROOT" "$fixture/standalone-paths.txt"
printf 'PASS: defaults, missing-workspace fallback, enclosing-workspace detection, build escape, variant traversal, symlink rejection and Bun temp\n'
