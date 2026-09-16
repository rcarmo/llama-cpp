# Gemma zero-copy generation parity, 16 September 2026

The deployed zero-copy Gemma service now uses model-derived sampling defaults and speculative `n_min=1`. Attached CPU threadpools and the historical small-target-batch dispatch are disabled. The accepted semantic changes were throughput-neutral on the sustained fixture and passed the full serving qualification.

## Live state

| Field | Value |
|---|---|
| Source commit | `ddb93ad19bfb6536f9f4ab6a8819527097de44ee` |
| Deployment root | `runtime/deployments/gemma-generation-parity-ddb93ad19-7871f502` |
| Server SHA-256 | `7871f50260b2d4491f719fefe64f768ded8fceb22248177418d349a3c237f314` |
| Rollback root | `runtime/deployments/gemma-zero-copy-rollback-0ba23ad3` |
| Model defaults | enabled; GGUF `top_k=64`, temperature `1.0` |
| Request overrides | preserved |
| Speculative policy | MTP depth 3, `n_min=1`, backend sampling off |
| Attached CPU pools | disabled |
| Context | 32,768; batch/uBatch 256/256; target threads 8/16 |
| Live endpoints | loopback `127.0.0.1:18094`; LAN `192.168.1.70:8094` |

The immutable deployment closure contains the executable and seven llama/ggml libraries. `libomp.so` remains in the separately hashed `runtime/gemma-vulkan-f32-0bdd7cd8b/runtime` directory. Local deployment binaries are ignored by Git; [deployment manifests](deployment/) retain their hashes, dependencies, environment and live loaded paths.

## Frozen fixtures

| Fixture | SHA-256 | Use |
|---|---|---|
| Historical 512-token prompt | `8553ca8562fbc2ced6af4580cedb400df75e137035f14cce41769cd58c86148f` | Raw `/completion` generation identity |
| Historical 512/64 payload | `62bbb1aad57b5d2241badd1ce2bf6bffa718f5865c21d28d052c1f8fa9853c2f` | Seed 731, temperature 0, `ignore_eos=true` |
| Sustained Chat Completions payload | `80f3209fc70a4b29468983f2b535a93a18d6fc65011263fbf2fd177edf52127f` | 512 generated tokens on the focused service |
| Frozen `normaliseTags` prompt | `a9aca028619bffeb4117a39d7a39945e2256048a89a6a14f3d8ae9bd4e82f9a6` | Unspecified-sampling quality check |

The raw Completion API and focused Chat Completions API use different rendering boundaries. Their timing results are reported separately.

## Factor results

The sustained fixture used fresh processes, 512 generated tokens, 385 drafted tokens, 382 accepted tokens, one output hash and zero swap in every row.

| Factor | Median decode change | Median wall change | Decision |
|---|---:|---:|---|
| Attached target/draft pools | +0.45% | -0.44% | Neutral four-run factor screen; rejected after the eight-run live/candidate comparison measured -1.98% decode |
| Model metadata on | -4.66% | +4.43% | Timing block confounded by temperature; request overrode temperature/top-k and produced identical work. Adopted for semantic parity after quality tests |
| `n_min=1` | -0.10% | -0.04% | Neutral; adopted for historical policy parity |
| Small target batches use the decode pool | -35.28% | +51.55% | Rejected; source patch removed |

ATTN4 and SCORE3 required a qualified small-target-batch parent. The parent failed, so neither child was ported or timed on this branch. Their historical results remain valid only for the old file-mediated service.

## Confirmation

The first eight-run comparison included attached pools and measured candidate decode 22.7611 versus live 23.2204 tok/s (-1.98%). Pools were disabled.

The final four-run ABBA compared the actual deployed binary with the deployable semantic profile: model metadata on, `n_min=1`, pools off. Median decode was 23.0666 live versus 23.0466 candidate (-0.09%); median wall time was 23.5099 versus 23.4842 seconds (-0.11%). Work, output and zero-swap state were identical. This is a neutral performance result.

The exact historical 512/64 request reproduced output SHA-256 `35f6d4194c1e9170ab5104d67b191ce47cee554fb21463d3f7d61cf86c2beddf`, 55 drafted tokens and 43 accepted tokens on current source. Current generic-server topology reached 9.8974 tok/s. Recreating the historical two-slot 128K/strict-placement topology reached 7.6688 tok/s. The retained historical build recorded 25.7672 tok/s. Source, server lifecycle and execution topology changed, so that retained throughput was not inherited.

The unspecified-sampling `normaliseTags` test used seeds 42 and 43. Live generic defaults and candidate model defaults both passed static assessment and the existing read-only, no-network, 256 MiB sandbox: 4/4 total passes. Generated lengths and MTP acceptance differed because the candidate used GGUF `top_k=64` instead of generic `top_k=40`.

## Qualification

The deployable candidate embedded the same 70 UI assets as the prior service. Candidate qualification passed:

- seven non-streaming requests: exact append reuse, tool call/result continuation, factual, arithmetic and coding outputs;
- two prompt-progress and 128 incremental content events before the final SSE event;
- streamed `get_temperature` call with valid `{"city":"Lisbon"}` arguments and `tool_calls` finish;
- disconnect after three content events, reset in 19.59 ms and cold `RECOVERED` response;
- overlapping request serialization: the second request queued for 11.96 seconds and completed after the first stream released the slot;
- resident Vulkan owner, positive shared bytes and zero copied bytes throughout;
- 13,796,917,248-byte candidate qualification peak, zero restarts and zero swap.

[Qualification artifacts](qualification/) include the props, UI response, request results, SSE timings, cancellation/serial result, loaded paths and checksums.

## Deployment verification

The guarded deployment copied complete candidate and rollback closures, verified checksums and `ldd`, installed the candidate environment and restarted the existing user service. Post-deployment checks recorded:

- PID `1876352` from the immutable candidate path;
- the expected executable SHA-256 and seven candidate-local llama/ggml libraries;
- matching loopback and LAN UI ETags with gzip HTML;
- LAN SSE with two progress events and 128 incremental content events;
- two handoffs, 1,168,113,664 shared bytes and zero copied bytes;
- Vulkan model residency;
- 13,914,943,488-byte service peak, zero restarts and zero swap.

The deployment runner restores `runtime/deployments/gemma-zero-copy-rollback-0ba23ad3/service.env` automatically if a gate fails. Manual rollback is:

```bash
install -m 0600 \
  runtime/deployments/gemma-zero-copy-rollback-0ba23ad3/service.env \
  ~/.config/llama-gemma-zero-copy/service.env
systemctl --user restart llama-gemma-zero-copy.service
```

Then verify the rollback executable hash `0ba23ad310513ff428dfd5fac6f7ad5288e8371362e7e5c65341695fc9428eab`, loaded paths, health, zero copied bytes, zero restarts and zero swap.

## Evidence map

- `baseline/` — frozen live/candidate build, model, library and UI identities.
- `factor-screen/` — threadpool, model-default and `n_min` screens.
- `smallbatch-screen/` — isolated rejected small-target-batch result and retained patch.
- `historical-fixture/`, `historical-topology/` — current-source Completion API controls.
- `live-candidate-ab/`, `live-candidate-confirm/`, `semantic-candidate-ab/` — sustained comparisons.
- `unspecified-sampling/` — frozen coding quality and sandbox results.
- `qualification/` — complete accepted-stack integration qualification.
- `deployment/` — immutable closure manifests and live verification.
- `failures/` — launcher, interruption and assertion failures with recovery state.
