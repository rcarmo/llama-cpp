#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Wrap CMake agent builds with validated project-scoped build/cache/tmp paths","kind":"mixed","weight":"standard","role":"entrypoint"}
set -euo pipefail
# shellcheck source=agent-paths.sh
source "$(dirname "${BASH_SOURCE[0]}")/agent-paths.sh"
action=${1:-paths}; shift || true
if [[ $action == profile ]]; then
    mode=baseline
    for arg in "$@"; do [[ $arg != --full ]] || mode=full; done
    BUILD_VARIANT=${BUILD_VARIANT:-clang-profile-$mode}
    RUN_PURPOSE=${RUN_PURPOSE:-profile}
elif [[ $action == requirements ]]; then
    BUILD_VARIANT=${BUILD_VARIANT:-python-requirements}
    RUN_PURPOSE=${RUN_PURPOSE:-requirements}
fi
llama_agent_init_paths
case $action in
    paths) exec bash "$(dirname "${BASH_SOURCE[0]}")/agent-paths.sh" --print;;
    configure|build|test|profile|requirements|exec) ;;
    *) echo 'Usage: agent-build.sh paths|configure|build|test|profile|requirements|exec [arguments]' >&2; exit 2;;
esac
for arg in "$@"; do
    case "$action:$arg" in
        configure:-B*|configure:-S*|configure:--preset*|configure:--fresh|configure:--workflow*|configure:--install*|configure:-D*CMAKE_CACHEFILE_DIR*|configure:-D*CMAKE_SOURCE_DIR*|configure:-D*CMAKE_BINARY_DIR*|build:--build*|build:--preset*|build:--clean-first|test:--test-dir*|test:--preset*|test:--build-and-test*)
            echo 'Source/build paths and cache reset must not be overridden in wrapper arguments.' >&2; exit 2;;
    esac
done
llama_agent_prepare_paths
case $action in
    configure) exec cmake -S "$LLAMA_SOURCE_DIR" -B "$LLAMA_BUILD_DIR" -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_EXPORT_COMPILE_COMMANDS=ON "$@";;
    build) exec cmake --build "$LLAMA_BUILD_DIR" --parallel "${JOBS:-2}" "$@";;
    test) exec ctest --test-dir "$LLAMA_BUILD_DIR" --output-on-failure "$@";;
    profile) exec bash "$(dirname "${BASH_SOURCE[0]}")/build-profile.sh" "$@";;
    requirements) exec bash "$(dirname "${BASH_SOURCE[0]}")/check-requirements.sh" "$@";;
    exec) [[ $# -gt 0 ]] || { echo 'exec requires a command.' >&2; exit 2; }; exec "$@";;
esac
