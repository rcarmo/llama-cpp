.PHONY: build agent-build

# Agent builds use scoped Xcode derived data without moving the legacy build.
agent-build:
	BUILD_VARIANT=apple-swift RUN_PURPOSE=swift bash ../../scripts/agent-build.sh exec bash -c 'exec xcodebuild -scheme llama-batched-swift -destination "generic/platform=macOS" -derivedDataPath "$$LLAMA_BUILD_DIR"'

build:
	xcodebuild -scheme llama-batched-swift -destination "generic/platform=macOS" -derivedDataPath build
	rm -f ./llama-batched-swift
	ln -s ./build/Build/Products/Debug/llama-batched-swift ./llama-batched-swift
