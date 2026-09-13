# Q6 paired projection: matched agentic ABBA result

The opt-in Q6 pair kernel reduces median whole-workflow time by1.20% and warm native-round time by1.57% in the prescribed OFF/ON/ON/OFF comparison. All four workflows pass both independent repair and follow-up grades. Prompts, raw model output, final source, generated/evaluated token counts and MTP work match exactly.

| Order | Mode | Runner wall s | Warm native s |
|---:|---|---:|---:|
| 1 | OFF | 57.656554 | 48.180127 |
| 2 | ON | 56.691087 | 47.978052 |
| 3 | ON | 57.087410 | 47.541052 |
| 4 | OFF | 57.503221 | 48.862496 |

Median whole time:57.579887s OFF versus56.889249s ON. Warm native:48.521312s OFF versus47.759552s ON. Both ON whole-workflow observations are below both OFF observations; warm ranges overlap. This is two repetitions per arm on one coding task, not a confidence interval or broad performance guarantee. Handoff itself is slightly slower in the ON observations, as expected for a change that targets CPU matrix work rather than handoff.

Every run has10 rounds,572 generated tokens,900 evaluated prompt tokens,549 drafted and389 accepted MTP tokens. Both modes use the same isolated CPU library, candidate allocation-batched zero-copy handoff and frozen write-v2 harness; only Q6 enablement changes. Tracing is off. All runs have zero swap, no sampled competitors, adequate host memory reserve and unchanged services; workers and tool containers drained after each exact-ID window.

A separate traced trained run passes both grades and proves the real m262144,n4,k2560 MTP projection selects the pair route. Its diagnostic timing is excluded. The prior reduced-row and full-shape synthetic gains (12.90% and11.70%) are not summed with this task result.

Retain the small measured task benefit and prepare portable, opt-in integration with negative layout/type/precision coverage. Vulkan FFN work and the combined candidate comparison are still required. Final merge to main/master and progress charts follow full-goal verification; no service deployment is authorised.
