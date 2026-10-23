# Final sampler-reset and staged-answer lifecycle checkpoint

Date 2026-10-08. This fix was prompted by independent review after D3 results; it corrects a common sampler reset defect. It is not a model-quality patch.

## Changes
- `common_sampler::reset()` now resets the external grammar and reasoning-budget samplers as well as its main sampler chain after clearing recent tokens. Before this, partial grammar/reasoning state could survive a reset.
- Added `common_sampler_reasoning_budget_state_get()` for precise lifecycle assertions.
- Manual harness D3 uses explicit `json_schema` and bounded thinking. It uses the existing reasoner until an end-tag sequence, then initializes an output-format grammar at root for subsequent answer tokens without replaying thought.
- `test-nemotron-schema-transition-lifecycle` is configured with a CMake `NEMOTRON_TEST_MODEL` FILEPATH option (or environment override). CTest is excluded if no model is explicitly configured; if configured to a missing path CMake fails. The predicate-only companion test stays weight/model-free.

## Tests
The vocabulary-only test loads the existing Q4 file with `vocab_only=true`, no model weights, no context and no generation. It covers:
- Natural end-marker partial vs complete boundary and common reasoning budget enters DONE.
- Coupled `common_sampler` reasoning budget + lazy JSON grammar: reasoning and natural end tokens pass through the same sampler, budget reaches DONE, close sequence is replayed into lazy grammar and `{` triggers constrained JSON. Valid output passes with no sampler replacement; after reset/rearm, invalid values reject.
- Forced reasoning end via common sampler's force API and via common reasoning-budget sampler; checks each configured notice/end token is the sole finite candidate before accepting it, then asserts DONE/end match and transitions answer stage.
- Well-formed JSON accepted; truncated and wrong-type JSON rejected.
- `common_sampler_reset` clears stale reasoning budget to IDLE, ignores old close marker, re-arms on a fresh start, and reaches DONE on fresh natural end.
- In a separate same-instance answer-sampler case, partial JSON grammar state advances (a second root `{` is rejected); resetting restores the root, a fresh `{` is accepted and complete JSON works. Answer grammar reset is reusable.

Correctly configured separate builds both pass 5 targeted CTests: reasoning-budget, grammar integration, JSON-schema conversion, schema-transition predicate and schema-transition lifecycle. CPU and Intel/Vulkan lifecycle executables also passed direct vocabulary-only invocation. (During setup, one first combined invocation mistakenly used the CPU build directory for its Vulkan phase; that is not counted; the Vulkan suite was subsequently correctly run from `gcc-intel-vulkan`, 5/5.) Source/build/CTest logs are retained under `quality-fix` and `schema-transition-D3`.

## Review and limits
Independent review initially identified the missing reset and a stale-state test gap; the reset was fixed and an explicit same-instance partial answer reset regression added. A second independent review of the reset implementation said the implementation was sound and the same-instance grammar test present; it flagged CMake path portability, which was replaced by explicit model configuration. After the final test extension, a third independent reviewer attempt timed out—so do not claim reviewer approval for the latest exact test diff.

The lifecycle CTest is vocab-only at runtime and proves host sampler/grammar state handling, not full GPU sampler / server streaming / cancel behavior. The broader D3 native quality series is format-valid10/10 but semantically exact only3/5 each CPU/handoff; report that separately. No quality/default/deployment promotion. Trusted high-precision comparison is blocked. Qwen/Gemma/speech remain off; no service is restored or deployed.

Local branch only. Reset/sample implementation commits pending final commit. Prior D3/Predicate local checkpoints: `1f7196674e`, `014d911c8`, `6d3d4d22f`.
