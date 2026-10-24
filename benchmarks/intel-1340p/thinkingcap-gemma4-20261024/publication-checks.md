# Publication checks - 24 October 2026

- Agent path and configure tests passed, including physical-workspace fallback, path escapes, symlinks, Bun temp paths and explicit Web UI defaults.
- The requested UI build correctly failed in a networkless container with no assets. That failed log is retained. After staging the existing verified UI into the isolated build cache, the build embedded 70 assets and linked `llama-server`. No active binary was replaced.
- The broad networkless CPU CTest run passed 75 of 82 tests. Python Jinja initially lacked `jinja2`; a targeted run using the existing cached Jinja2/MarkupSafe modules passed. Together, 76 distinct CTests passed, including CPU semantic graph replay.
- Six tests require network downloads or the downloaded model: `test-download-model`, `test-llama-context-model`, `test-thread-safety`, `test-arg-parser`, `test-eval-callback-download-model` and `test-eval-callback`. They failed or were not run in this networkless setup. The argument-parser failure reached its good-URL GET request. This is not a passing full CTest suite.
- A first Jinja follow-up used the wrong Make override (`AGENT_TEST_ARGS`, which is ignored), repeated the broad suite and was interrupted by the caller. The final targeted run uses the documented `TEST_ARGS=-R test-jinja-py --parallel 1`. The source Makefile is unchanged by this correction.
- All eight frozen coding source/input checksums passed. The original six ThinkingCap answers were not regenerated.
- All 34 cross-model replay observations passed finite-logit checks. The eight ThinkingCap placement confirmations had matching full-logit hashes. Individual configs, samples and failures are in the evidence archive.
- The promoted eight-thread service passed CLI equality checks against the four-thread baseline, except the intended thread count/mask. HTML returned 200; the SSE smoke ended naturally with `READY`, finish reason `stop` and `[DONE]`. Model/runtime/quantisation and remaining CLI arguments were unchanged. The original four-thread container is preserved.
- Fork-local documentation was audited for current operating state, budget groups, completed coding state and relative links. Historical measurements and other-host deployment settings were preserved. No trained-model weights, executables, credentials or build caches are included in this commit.

Logs are under [checks](checks/). `SHA256SUMS` covers the retained evidence archive. The live service remains a boot-disabled, LAN-only experiment.
