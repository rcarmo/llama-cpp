#!/usr/bin/env bash
# SCRIPT_JDOC: {"summary":"Resolve and validate workspace-scoped llama-cpp build/cache/run paths","kind":"read-only","weight":"lightweight","role":"entrypoint"}
# Source this helper without arguments; no directories are created until prepare.
llama_agent_init_paths() {
    local source_path workspace scan namespace source_ref candidate key value common_root common_dir root_basis
    source_path=$(realpath -e "${LLAMA_SOURCE_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)}") || return 1
    common_root=$source_path
    if common_dir=$(git -C "$source_path" rev-parse --git-common-dir 2>/dev/null); then
        [[ $common_dir == /* ]] || common_dir="$source_path/$common_dir"
        common_dir=$(realpath -e "$common_dir") || return 1
        if [[ $(basename "$common_dir") == .git ]]; then common_root=$(dirname "$common_dir"); fi
    fi
    workspace=${WORKSPACE_ROOT:-}
    root_basis=explicit
    if [[ -n $workspace && ! -d $workspace ]]; then workspace=; fi
    if [[ -z $workspace ]]; then
        scan=$source_path
        while [[ $scan != / ]]; do
            if [[ -d $scan/.pi && -d $scan/.piclaw ]]; then workspace=$scan; root_basis=enclosing-workspace; break; fi
            scan=$(dirname "$scan")
        done
    fi
    if [[ -z $workspace ]]; then
        for key in GITHUB_WORKSPACE CI_PROJECT_DIR BUILD_SOURCESDIRECTORY BITBUCKET_CLONE_DIR BUILD_WORKSPACE_DIRECTORY; do
            value=${!key:-}
            if [[ -n $value && -d $value ]]; then
                candidate=$(realpath -e "$value") || return 1
                if [[ $source_path == "$candidate" || $source_path == "$candidate/"* || $common_root == "$candidate" || $common_root == "$candidate/"* ]]; then
                    workspace=$candidate; root_basis="ci-$key"; break
                fi
            fi
        done
    fi
    if [[ -z $workspace ]]; then workspace=$common_root; root_basis=repository-common-root; fi
    workspace=$(realpath -e "$workspace") || return 1
    [[ -d $workspace && $workspace != / && $workspace != /tmp && $workspace != /var/tmp ]] || {
        echo 'Workspace root must be an existing project/workspace directory, not a system temporary root.' >&2; return 1;
    }
    [[ $source_path == "$workspace" || $source_path == "$workspace/"* || $common_root == "$workspace" || $common_root == "$workspace/"* ]] || {
        echo 'Workspace root must contain the source checkout or its common worktree root.' >&2; return 1;
    }
    LLAMA_ROOT_BASIS=$root_basis
    BUILD_VARIANT=${BUILD_VARIANT:-cpu-release}
    RUN_PURPOSE=${RUN_PURPOSE:-build}
    [[ $BUILD_VARIANT =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ && $RUN_PURPOSE =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || {
        echo 'BUILD_VARIANT and RUN_PURPOSE must be named path components.' >&2; return 1;
    }
    namespace="$(basename "$source_path")-$(printf '%s' "$source_path" | cksum | awk '{print $1}')"
    source_ref=$(git -C "$source_path" rev-parse --short=12 HEAD 2>/dev/null) || source_ref=unversioned
    WORKSPACE_ROOT=$workspace
    LLAMA_SOURCE_DIR=$source_path
    PROJECT_TMP_ROOT="$workspace/tmp/llama-cpp"
    # Reject symlink roots that would write outside the physical workspace.
    candidate=$(realpath -m "$PROJECT_TMP_ROOT") || return 1
    [[ $candidate == "$PROJECT_TMP_ROOT" ]] || { echo 'Project tmp root must not redirect through a symlink.' >&2; return 1; }
    LLAMA_BUILD_DIR=${LLAMA_BUILD_DIR:-"$PROJECT_TMP_ROOT/build/$namespace/$BUILD_VARIANT"}
    LLAMA_CACHE_DIR=${LLAMA_CACHE_DIR:-"$PROJECT_TMP_ROOT/cache/$namespace/$BUILD_VARIANT"}
    LLAMA_RUN_DIR=${LLAMA_RUN_DIR:-"$PROJECT_TMP_ROOT/runs/$RUN_PURPOSE-$source_ref/$namespace/$BUILD_VARIANT"}
    for key in LLAMA_BUILD_DIR LLAMA_CACHE_DIR LLAMA_RUN_DIR; do
        value=${!key}
        case $key in
            LLAMA_BUILD_DIR) candidate="$PROJECT_TMP_ROOT/build/";;
            LLAMA_CACHE_DIR) candidate="$PROJECT_TMP_ROOT/cache/";;
            LLAMA_RUN_DIR) candidate="$PROJECT_TMP_ROOT/runs/";;
        esac
        value=$(realpath -m "$value") || return 1
        [[ $value == "$candidate"* && $value != "${candidate%/}" ]] || {
            echo "$key must be a named child of $candidate" >&2; return 1;
        }
        printf -v "$key" '%s' "$value"
    done
    TMPDIR="$LLAMA_RUN_DIR/tmp"
    TMP=$TMPDIR
    TEMP=$TMPDIR
    BUN_TMPDIR=$TMPDIR
    CCACHE_DIR="$LLAMA_CACHE_DIR/ccache"
    CCACHE_TEMPDIR="$LLAMA_RUN_DIR/ccache-tmp"
    XDG_CACHE_HOME="$LLAMA_CACHE_DIR/xdg"
    BUN_INSTALL_CACHE_DIR="$LLAMA_CACHE_DIR/bun"
    npm_config_cache="$LLAMA_CACHE_DIR/npm"
    PIP_CACHE_DIR="$LLAMA_CACHE_DIR/pip"
    UV_CACHE_DIR="$LLAMA_CACHE_DIR/uv"
    HF_HOME="$LLAMA_CACHE_DIR/huggingface"
    LLAMA_UI_OUT_DIR="$LLAMA_BUILD_DIR/ui/dist"
    for key in TMPDIR BUN_TMPDIR CCACHE_TEMPDIR CCACHE_DIR XDG_CACHE_HOME BUN_INSTALL_CACHE_DIR npm_config_cache PIP_CACHE_DIR UV_CACHE_DIR HF_HOME LLAMA_UI_OUT_DIR; do
        value=${!key}
        candidate=$(realpath -m "$value") || return 1
        [[ $candidate == "$value" ]] || { echo "$key must not redirect through a symlink." >&2; return 1; }
    done
    export WORKSPACE_ROOT LLAMA_ROOT_BASIS LLAMA_SOURCE_DIR PROJECT_TMP_ROOT BUILD_VARIANT RUN_PURPOSE
    export LLAMA_BUILD_DIR LLAMA_CACHE_DIR LLAMA_RUN_DIR TMPDIR TMP TEMP BUN_TMPDIR CCACHE_DIR CCACHE_TEMPDIR
    export XDG_CACHE_HOME BUN_INSTALL_CACHE_DIR npm_config_cache PIP_CACHE_DIR UV_CACHE_DIR HF_HOME LLAMA_UI_OUT_DIR
}

llama_agent_prepare_paths() {
    mkdir -p "$LLAMA_BUILD_DIR" "$LLAMA_CACHE_DIR" "$TMPDIR" "$CCACHE_DIR" "$CCACHE_TEMPDIR" "$XDG_CACHE_HOME" "$BUN_INSTALL_CACHE_DIR" "$npm_config_cache" "$PIP_CACHE_DIR" "$UV_CACHE_DIR" "$HF_HOME"
}

if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
    set -euo pipefail
    llama_agent_init_paths
    case ${1:---print} in
        --print) for key in WORKSPACE_ROOT LLAMA_ROOT_BASIS LLAMA_SOURCE_DIR PROJECT_TMP_ROOT LLAMA_BUILD_DIR LLAMA_CACHE_DIR LLAMA_RUN_DIR TMPDIR CCACHE_DIR; do printf '%s=%s\n' "$key" "${!key}"; done;;
        --get) case ${2:-} in WORKSPACE_ROOT|LLAMA_SOURCE_DIR|PROJECT_TMP_ROOT|LLAMA_BUILD_DIR|LLAMA_CACHE_DIR|LLAMA_RUN_DIR|TMPDIR|CCACHE_DIR) printf '%s\n' "${!2}";; *) echo 'Unknown path key.' >&2; exit 2;; esac;;
        *) echo 'Usage: agent-paths.sh [--print|--get PATH_KEY]' >&2; exit 2;;
    esac
fi
