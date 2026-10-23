# Upstream sync validation, 23 October 2026

[Integration decisions and limits](../../../docs/local/cross-platform/upstream-sync-20261023.md).

Starting fork: `fdfd814abcb34915b23a5f206c88c834f0f1333f`. Integrated upstream: `280141e6d4769b1e4424de999437cc72ffac33d6`.

Sigma CPU, existing Fedora 44 build image, GNU/native Release, two-CPU/4-GiB networkless containers. No render-device access, trained model weights or serving activity.

Retained logs:

- `cpu-configure.log`, `cpu-build.log`: full CPU build.
- `vulkan-configure.log`, `vulkan-build.log`: Vulkan-enabled build, including shader compilation.
- `offline-tests.log`: final 72/72 offline CTests.
- `fixture-tests.log`: final 2/2 generated-model/context CTests.
- `semantic-replay.log`: CPU graph replay with explicit two compute threads, 3/3 cases.
- `initial-tests.log`: initial unfiltered run, including fixture merge error and unavailable network/Python dependencies.
- `initial-offline-tests.log`: 72 passing tests and default-thread semantic-replay timeout.
- `offline-tests.txt`: explicit final offline selection.

The corrected fixture setup and explicit two-thread replay pass. Remote-download tests, the network-dependent argument-parser run and Python Jinja test were not completed. CUDA and Metal could not be compiled on this host. No trained-model quality or performance result was produced.

Builds and temporary fixtures use the physical workspace's `tmp/llama-cpp/` paths through `make agent-*` and `scripts/agent-build.sh exec`. Mutable build state is excluded from this retained evidence directory. `SHA256SUMS` covers the selected logs and selection file; it does not include itself or this README.
