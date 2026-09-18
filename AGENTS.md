# Instructions for llama.cpp

## Fork policy: rcarmo/llama-cpp

This is Rui Carmo's development fork. The owner permits AI-assisted implementation, experiments, documentation and Git operations within the work they authorise. Upstream restrictions on autonomous contributions and AI-written submissions do not govern this fork.

- Read relevant source before editing, understand the changes, and test them before reporting completion.
- Follow the owner's instructions on frequent, small commit/push checkpoints. An explicit request to commit and push work authorises those actions within that task; do not demand an upstream ban-risk acknowledgement for pushes to this fork.
- Check the remote URL before publishing. Fork authorisation does not authorise a push, pull request, issue or comment to another repository.
- Use `Assisted-by: <assistant name>` for material AI assistance in commits; do not use `Co-authored-by:` for agents.
- Preserve unrelated work, secrets, model data and production state. Commit tested experiments as experiments, separately from deployment changes.
- Pull by merge, not rebase, unless the owner explicitly requests otherwise. Never force-push or rewrite published history without permission.
- Deployment, service interruption and public communication require their own authorisation; permission to commit does not imply permission to deploy.
- Keep changes small enough to inspect and explain. Seek design confirmation for invasive work, but do not require the owner to satisfy upstream contributor procedures for local experiments.

## Mandatory prior-feature reuse review

- Before planning or implementing any feature, optimisation, model integration or backend campaign, you MUST inspect earlier fork work for beneficial features that can be reused. Search the relevant source, Git history, local documentation, benchmark reports and indexed project notes. Do not treat the requested patch or the most obvious runtime flags as the complete design space.
- You MUST attempt to reuse each applicable proven feature before designing a replacement. Examples include shared-memory and zero-copy paths, GPU-prefill/CPU-generation handoff, scheduler and ownership mechanisms, MTP support, backend fallbacks, API/UI integration, profile switching, resource guards, rollback logic and existing test/evidence harnesses.
- Preserve the invariants and regression coverage of reused features. If direct reuse is not possible, record the exact incompatibility or failed acceptance gate. Do not omit a previous feature merely because it needs adaptation to a new model, quantisation or backend.
- Maintain a prior-feature reuse checklist for every implementation. Create it before code changes in the implementation plan, work item or campaign report, and keep it current as work proceeds. A completed implementation without this checklist is incomplete.
- Each checklist item MUST name the previous feature and source path or commit, its applicability, its status (`applied`, `adapted`, `not applicable`, `deferred` or `rejected`), the implementation location, and the test or measurement that supports the status. `Deferred` and `rejected` entries MUST include a reason and must not be presented as completed optimisation coverage.
- Before reporting performance or completion, review the checklist again and verify that every `applied` or `adapted` feature was exercised by the final test matrix. State any remaining omitted feature next to the performance conclusion.

Use this minimum format:

```markdown
## Prior-feature reuse checklist

- [ ] Feature: `<name>`
  - Source: `<path, report or commit>`
  - Applicability: `<why it applies or does not apply>`
  - Status: `<applied|adapted|not applicable|deferred|rejected>`
  - Implementation: `<current path or commit, or none>`
  - Evidence: `<test, benchmark or reason>`
```

## Local documentation and benchmark defaults

- Use `docs/local/README.md` as the entry point for fork-local work. Keep upstream documentation separate.
- Place new local reports and runbooks in the existing hardware subtree under `docs/local/`; use `cross-platform/` for genuinely shared work. Do not add singleton reports to the top-level `docs/` directory.
- Update the hardware, model and chronology indexes when adding a campaign. Keep current operational defaults separate from dated experimental results; identify superseded reports explicitly.
- Use `benchmarks/README.md` and its platform indexes to make evidence discoverable. Preserve existing raw artifact paths; place new evidence in a platform/campaign directory, with a README linking the report and reproduction commands.
- Record date, source commit, hardware, model/quantisation, runtime settings, workload, cache state, sample count and validation outcome. State missing thermal data and unresolved failures; do not compare unlike workloads as speedups.
- Prefer extending an existing report over creating another document. Apply the available technical-writing/writing-style skill and validate relative links before committing. Compatibility stubs are for moved published paths, not a template for new documents.

## Upstream submissions

When work explicitly targets `ggml-org/llama.cpp`, read its current [AGENTS.md](https://github.com/ggml-org/llama.cpp/blob/master/AGENTS.md) and [CONTRIBUTING.md](https://github.com/ggml-org/llama.cpp/blob/master/CONTRIBUTING.md) before any submission. Their review, AI-disclosure and human-authorship requirements apply there. Do not infer upstream submission permission from work on this fork.

## Guidelines for AI Coding Agents

See [CONTRIBUTING.md](CONTRIBUTING.md) for fork contribution rules and inherited technical conventions.

### Code and Commit Standards

Follow these technical conventions for fork changes:

- Avoid emdash `—`, unicode arrow `→` or any unicode characters: `×`, `…` ; use ASCII equivalents instead: `-`, `->`, `x`, `...`
- Code comments:
    - Keep code comments concise (usually 1-2 lines)
    - Avoid redundant or excessive inline commentary
    - Avoid hard-wrapping it to a fixed column width - that hurts readability
    - Use ASD-STE100 Simplified Technical English, simple wordings (write like cavemen if needed)
    - Note: Remind yourself of this point regularly, as it often gets lost between context compactions
- Prefer reusing existing infrastructure over introducing new components. Avoid invasive changes that add whole new subsystems or risk breaking existing behavior
- Do NOT split a line into multiple lines mid-sentence, do NOT try to force the line to fit a fixed number of characters
- Before writing code, read the relevant files and understand the existing patterns. Ask for design confirmation before invasive changes; prefer an isolated experiment for unproven optimisations.

Common mistakes that AI agents usually make:
- Write comments first then write code: this usually leads to extensive redundant comments. Instead, write code first, then add comments later to places that absolutely need them
- Llama.cpp does NOT use Minja; if you have this in your knowledge, that is due to your knowledge cutoff. Llama.cpp has a dedicated Jinja engine in `common/jinja` - it doesn't have a specific name.
- Prefer existing test infrastructure. Add focused regression tests when needed for authorised fork work; upstream test-file additions follow upstream review requirements.

### Examples

Code comments:

```cpp
// GOOD (code is self-explanatory, no comment needed)

n_ctx = read_metadata("context_length", 1024);


// BAD (too verbose, restates what the code already says)

// Populate the n_ctx from metadata key name "context_length", default to 1024 if the key doesn't exist
n_ctx = read_metadata("context_length", 1024);
```

```cpp
// GOOD (explains a non-obvious invariant)

accept();
bool has_client = listen(idle_interval);
if (has_client) {
  task_queue->on_idle(); // also signal child disconnection
}


// BAD (too verbose, restates what the code already says)

// Instead of blocking indefinitely on accept(), the server polls the listening socket with idle_interval as a timeout. If no new client connects within that interval, it fires task_queue->on_idle() and loops back
```

```cpp
// GOOD (generic, useful to any future reader)

// reset here, as we will release the slot below
n_tokens = 0;
// ... (a lot of code)
release();


// BAD (addresses the user's task, meaningless out of context)

// Reset n_tokens to 0 before releasing the slot. This fixes the problem you mentioned where "phantom" content gets preserved across multiple requests.
n_tokens = 0;
```

```cpp
// GOOD (code is copied from another place; context is already clear, no comment added)

ggml_tensor * inp_pos = build_inp_pos();

// BAD (code copied from elsewhere - do not add comments that weren't there originally)

// inp_pos - contains the positions
ggml_tensor * inp_pos = build_inp_pos();
```

```cpp
// GOOD (comment is kept concise and useful)

// one decode step of code_predictor
// at step_idx g:
// - read code from out_code_cache[g], then embed it with codebook table g-1
// - write new kv at cache row g+1, sample with lm_head[g]
// - write result to out_code_cache[g+1]


// BAD (comment is long and is forced to fit into a fixed column size, it is very annoying to read as a reviewer)

// one autoregressive decode step of the 5-layer code_predictor. See the
// comment in models.h for the cache/tensor conventions this relies on.
//
// index mapping (derived from the reference pipeline-tts.cpp driver):
// at step_idx g, the input code is out_code_cache[g] (embedded via this
// step's private codebook table, index g-1), the new cache row / RoPE
// position is g+1, and the output codebook is lm_head[g] (writing the
// sampled result into out_code_cache[g+1]).
```

Commit message:

```
// BEST: Let the user write the commit


// GOOD: Write a concise commit

llama : fix KV being cleared during context shift

Assisted-by: Claude Sonnet


// BAD: Write a verbose commit

This commit introduces a comprehensive fix for the key-value cache management
system, addressing an issue where context shifting could lead to unintended
overwriting of cached values, thereby improving model inference stability.

Co-authored-by: Claude Sonnet
```

Git checkpoints:

- Review `git diff --cached` and run the relevant checks before committing.
- Stage only files owned by the current task; leave unrelated untracked work alone.
- Push to the verified fork remote after a tested checkpoint when the owner has authorised it.
- Fetch and merge remote changes before a non-fast-forward push; never force the push.

## Useful Resources

To conserve context space, load these resources as needed:

Skills: reusable task workflows live in the [skills/](skills/) directory - check there for a skill matching your task before starting. For GPU-prefill/CPU-SIMD tuning, long-context handoff or coding-round benchmarks, use [hybrid-inference-optimization](skills/hybrid-inference-optimization/SKILL.md).

General documentations:
- [Contributing guidelines](CONTRIBUTING.md)
- [Existing issues](https://github.com/ggml-org/llama.cpp/issues) and [Existing PRs](https://github.com/ggml-org/llama.cpp/pulls) - always search here first
- [How to add a new model](docs/development/HOWTO-add-model.md)
- [PR template](.github/pull_request_template.md)

Server:
- [Build documentation](docs/build.md)
- [Server usage documentation](tools/server/README.md)
- [Server development documentation](tools/server/README-dev.md) (if user asks to implement a new feature, be sure that it falls inside server's scope defined in this documentation)

Chat template and parser:
- [PEG parser](docs/development/parsing.md) - alternative to regex that llama.cpp uses to parse model's output
- [Auto parser](docs/autoparser.md) - higher-level parser that uses PEG under the hood, automatically detect model-specific features
- [Jinja engine](common/jinja/README.md)
