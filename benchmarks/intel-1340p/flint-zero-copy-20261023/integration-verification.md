# Combined-source verification — 23 October 2026

**The complete CPU/Vulkan tools, server, examples and tests build passed. All 77 distinct offline CTests passed across the bulk run and one dependency rerun.** No model-serving unit or installed runtime was restored.

| Check | Result | Evidence |
|---|---|---|
| Complete configured build | Pass, 205 remaining build actions | [Build log](build-publication.log) |
| Offline CTests | 76 bulk passes; Python Jinja rerun passes; 77 distinct passes | [Aggregated test results](verified-test-results.json), [bulk log](ctest-publication.log), [dependency rerun](ctest-jinja-dependency-rerun.log) |
| Targeted handoff, shared views and schema predicate | 9/9 pass, also included in bulk coverage | [Targeted log](unlimited-targeted-ctest.log) |
| Workspace path policies | Pass: defaults/fallback/enclosing workspace, escapes, symlink rejection, Bun temp | [Path log](path-tests-combined.log) |
| Target-only service CLI | Help builds/runs; no server started | [CLI output](qwen-cli-help.log) |
| Sampler reset/schema lifecycle | Pass with existing Flint vocabulary only | [Lifecycle log](schema-lifecycle-flint-vocab.log) |
| Coding references/scorer | 1,053 reference assertions and five structural-boundary tests pass | [Completion-driven protocol](coding-unlimited/README.md) |
| Active benchmark identities | Executable and libllama unchanged after publication build | [Hash check](benchmark-binary-unchanged.log) |

## Environment failures and coverage

The initial bulk run selected 78 tests: 76 passed, Python Jinja failed because `jinja2` was absent, and the argument-parser test failed on its unconditional live HTTP request in the networkless container. Both failures are retained in the bulk log. Pinned Jinja2 3.1.6 and MarkupSafe 3.0.2 were acquired separately into project-local cache; the Python test then passed with networking still disabled. [Dependency identities](python-dependencies.json) include package SHA256 values; MarkupSafe used its pure-Python fallback. Successful bulk tests were not repeated.

The final [offline selection](offline-test-names.txt) has 77 tests. [Ten excluded tests](offline-exclusions.json) require network or external model fixtures, including the live-download argument-parser test. The optional model-dependent Nemotron lifecycle/reference inference is not configured. The extra lifecycle probe uses only Flint vocabulary and cannot establish Nemotron model quality. CUDA, Metal/macOS, real Swift compilation, live serving/API/UI checks and full network/model-dependent CI were not run. Swift and conversion Make wrappers received dry-run checks only. No prebuilt Web UI assets were downloaded.

## Source compatibility and provenance

The integrated tree retains Flint runtime/tests, project-scoped build paths, older Nemotron handoff/sampler work and Qwen target-only service fixes. The Nemotron diagnostic now tokenises `common_chat_prompt::str()`, checks rendered prompt parity, appends pieces through `common_chat_input` and parses through `common_chat_session::finish()`. The earlier compile failures are retained locally.

The verified native source is `8999b4061` plus the [recorded patch](coding-unlimited/source-before-generation.patch). Committing these already-tested bytes changes Git metadata; it does not rerun or replace the original throughput measurements. [Original throughput](../../../docs/local/intel-i5-1340p/flint-throughput-20261023.md), archived logs and their binary identities remain separate.

## Active coding evaluation

The [completion-driven series](coding-unlimited/README.md) continues. At this checkpoint the CSV task passed 33 assertions after 6,095 tokens; the six-task total is incomplete. The earlier capped series is retained as budget calibration. Publication checks suspended and resumed native processes without changing their model/KV/sampler state. [Pause events](coding-unlimited/publication-pause.jsonl) remain part of the timing evidence; this series is not a matched throughput comparison. No generation was restarted or answer repaired.

## Documentation review

The affected Markdown reports, navigation indexes, service implementation guide and retained runbooks were reviewed. Dated notices supersede old Sigma deployment instructions. Historical campaign measurements stay unchanged. Two unavailable Nemotron log links were replaced with explicit missing-capture notices; their structured JSON/resources remain in the repository. Local link targets, code fences and source/Markdown whitespace were checked. Raw logs and patches retain their original whitespace. Current evidence logs are added explicitly because the repository otherwise ignores `*.log`.
