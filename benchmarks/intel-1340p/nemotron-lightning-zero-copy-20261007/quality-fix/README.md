# Reasoning-budget correction and residual quality failures

7 October 2026. **Fixed an omitted native inference control, not the model's general task accuracy.** The manual semantic harness now wires the existing common reasoning-budget sampler from renderer start/end tags, preserves an answer reserve, supports the existing budget-end message, and reports settings. The general candidate policies do not pass all original or held-out tasks. No quality/default/serving promotion.

Implementation `7346961c2ad203da545fc83e269e4cf7498c0859`.

Parent quality evidence `b68ad22c44a56c41b41ed898e5ba76bd836c8c0d`. Original failures and scores remain intact. [A results](results-A.json), [B results](results-B.json), [original-task A suite](suite.json), [B suite with held-out cases](suite-B.json), [plan](reproduce/plan.md), [source and hash receipt](source-manifest.txt).

## Root cause and change

The original incident reasoning trace derived the expected facts but never reached content within768 generated tokens. `tests/test-nemotron-semantic-handoff.cpp` previously set generation_prompt but did not populate `reasoning_budget_start/end/forced/tokens`; the common sampler therefore had no bounded reasoning control. Reused `common/reasoning-budget.*`, native server-schema setup and existing sampler tests rather than injecting model answers or modifying kernels.

Requests may now explicitly set `reasoning_budget >= 0`. The harness requires thinking on, nonempty renderer reasoning tags, and more than64 tokens reserved beyond the reasoning limit. It tokenises start/end markers, forces the first end sequence, optionally preceded by the existing `reasoning_budget_message`. Default remains-1/unlimited, so previous requests are unchanged. Invalid/negative generation budgets, thinking-off budget, absent answer reserve and INT_MAX budget fail before model load. Overflow-safe reserve check is used.

Both CPU and Intel builds pass; existing reasoning-budget CTest passes. Four invalid-request checks return the expected errors without loading any model. Native candidate observations exercise the forced end; final source adds only overflow-safe validation after those runs. Source/binary identities are recorded separately.

A bare forced end is insufficient for guaranteed final-answer formatting: some outputs continued prose analysis in content. The budget-end message is a general transition cue, not fixture-specific facts or answers. Even with that message the model can output wrong facts/code, so completing a response is not task success.

## Prespecified candidates

Unchanged user prompts and expected outputs for original LRU/policy/conflicts/incident. New labelled series, not an erasure of the previous budget/greedy failures.

- A: thinking on,greedy temperature0,512 reasoning tokens /1536 total,seed42/top-k40/top-p0.95/min-p0. No system instruction/end message. Four original failing tasks, both profiles.
- B: same budgets,temperature1, general rule-fidelity/uncertainty/code-edge-case system instruction and budget-end message. Four original tasks plus two held-out tasks frozen before any candidate results: a return waiver that changes deadline only and contradictory FreeBSD/auditlog sources. One observation/task/profile. B is a combined policy, not isolated causal evidence.

| Original task | A CPU | A handoff | B CPU | B handoff |
|---|---|---|---|---|
| LRU260 executable assertions | Pass | Pass | Pass | Fail |
| Scoped expense exception | Truncated | Fail formatting | Wrong | Wrong |
| Contradiction abstention | Wrong | Wrong | Wrong | Pass |
| Incident JSON answer | Fail formatting | Pass | Pass | Pass |

A scoresCPU1/4,handoff2/4. B original tasksCPU2/4,handoff2/4; counting its two held-out tasks givesCPU3/6,handoff4/6. These denominators are not comparable to the original8-task score.

B held-out return waiver: CPU invents a rejected record `R20` that was not supplied; handoff passes. B held-out contradictory evidence: both pass. The user text was compact, but nonexistent record invention is not excused or removed from scoring. No additional prompt changes/retries were made after the held-out results.

B LRU handoff uses `if (!value)` for Map membership, so cached0 is incorrectly reported missing (assertion1 actual-1 vs expected0). This is a regression from the previous handoff LRU and A. All other candidate LRU outputs pass260 checks in the existing readonly/no-network CPU1/256MiB/10s Bun sandbox.

B policy CPU again omits the valid manager exception (95 vs135). B handoff over-applies it to missing receipt C (160 vs135). B CPU conflicting sources still declares Windows offline=no rather than requiredunknown; B handoff now preserves uncertainty. A policy handoff has correct facts but Markdown/prose instead of requested JSON, so remains a failure. Both B incident responses are complete, correctly formatted and contain the expected evidence/uncertainty facts.

## Safety, reuse and limits

20 new model runs: A8,B12. CPU4/20GiB/no swap/host reserve>=6GiB/renderD128/F16KV/FAoff/rs3/batch512/ub128/4096ctx/mmap unchanged;180s per native run. No driver/kernel/layout or production configuration changes. All handoffs retain268937728 shared bytes/copy0/GPU-owner destruction before generation. Native completion19/20, but score counts task formatting/meaning/code separately. Minimum sampled host available12,106,424KiB, maximum peak20GiB, zero sampled process swap/OOM/OOM-kill. Counters sampled, not necessarily final reclaim counts. No thermal/affinity or full CI qualification.

Prior-feature reuse:
- Applied/adapted: native common reasoning-budget sampler and server marker/end-message setup; existing CTest plus real incident controls and invalid-request checks.
- Preserved: common Jinja/PEG/tool grammar, sampling defaults and explicit seed; no answer-specific constraints or postprocessing repair.
- Preserved: strict atomic state handoff, mmap/source GPU-owner release and existing resources; all candidate accounting/finite/ownership checks retained.
- Preserved: independent frozen factual/code oracles and sandbox; no tolerances weakened.
- Deferred: model-weight/quantisation comparison, stronger reasoning/retrieval profile, broader repeated quality evaluation and serving integration. They are separate experiments, not implied fixes.

User explicitly removed the need to ask GPU permission. Future work checks contention and reports ownership/drain, without approval requests. This window was drained/released to @whisper; no trial native/container/DRM client remains. Qwen/Gemma/speech stay off, primarymasterfdfd and ten dirty policy files unchanged. Local checkpoint only, not pushed/defaultmerged/deployed.

Conclusion: retain opt-in reasoning control as a verified completion fix. Reject A/B as general quality defaults. The remaining accuracy problem is not fixed; another backend patch or larger output budget cannot honestly be claimed to solve it from these results.
