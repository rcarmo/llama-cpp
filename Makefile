# Explicit agent helpers wrap CMake; the legacy Make build remains unsupported.
# Root fallback: explicit workspace > enclosing workspace > CI checkout > Git common checkout.
# Missing tmp/llama-cpp children are created; CI needs no PiClaw markers.
SHELL := /bin/bash
SOURCE_ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
.DEFAULT_GOAL := help

export WORKSPACE_ROOT LLAMA_SOURCE_DIR BUILD_VARIANT RUN_PURPOSE
export LLAMA_BUILD_DIR LLAMA_CACHE_DIR LLAMA_RUN_DIR JOBS

JOBS ?= 2
CMAKE_ARGS ?=
BUILD_ARGS ?=
TEST_ARGS ?=
PROFILE_ARGS ?=
REQUIREMENTS_ARGS ?=

.PHONY: help agent-paths agent-configure agent-build agent-test agent-profile agent-requirements
help:
	@printf '%s\n' 'The legacy Make build was replaced by CMake.' 'Agent workflow: make agent-paths agent-configure agent-build agent-test' 'Web UI: enabled for server builds; agent-configure resets old disabled UI cache values.' 'Paths: physical workspace/tmp/llama-cpp/{build,cache,runs}; isolated by worktree and BUILD_VARIANT.' 'Overrides: WORKSPACE_ROOT LLAMA_SOURCE_DIR BUILD_VARIANT RUN_PURPOSE JOBS CMAKE_ARGS BUILD_ARGS TEST_ARGS.' 'Root fallback: explicit existing workspace > enclosing workspace > CI checkout > repository/common worktree root.' 'CI needs no .pi/.piclaw; missing tmp children are created, never /tmp or unrelated .cache.' 'Existing build/cache/runtime state is not moved or cleaned.'

agent-paths:
	bash "$(SOURCE_ROOT)/scripts/agent-build.sh" paths

agent-configure:
	bash "$(SOURCE_ROOT)/scripts/agent-build.sh" configure $(CMAKE_ARGS)

agent-build:
	bash "$(SOURCE_ROOT)/scripts/agent-build.sh" build $(BUILD_ARGS)

agent-test:
	bash "$(SOURCE_ROOT)/scripts/agent-build.sh" test $(TEST_ARGS)

agent-profile:
	bash "$(SOURCE_ROOT)/scripts/agent-build.sh" profile $(PROFILE_ARGS)

agent-requirements:
	bash "$(SOURCE_ROOT)/scripts/agent-build.sh" requirements $(REQUIREMENTS_ARGS)

%:
	@printf '%s\n' 'The Make build was replaced by CMake; use the explicit agent-* wrappers or docs/build.md.' >&2
	@exit 2
