# Large FP32 score tile: correct, 314% slower

The128x128 score tile is rejected for performance adoption. Four48K ABBA suffix runs measured **94.521s versus22.838s** for the retained64x64 tile, **313.88% slower**. Both arms retained FP32 accumulation, active256/max1024 allocation and the same1022-token suffix from49152 cached tokens. B0 production remains unchanged.

## Implementation and availability

The candidate targets only Intel device0xa7a0 without cooperative matrices, F16/F32 long score products with k512,m>=32768,n>=128 and forcedFP32. Value products and ordinary pipeline selection remain unchanged. It reuses the existing128x128 shader with its normal shared-memory checks.

The first build passed six native numerical cases in both modes, but the override trace never appeared. Source inspection found that Intel non-cooperative-matrix devices disable large pipeline creation. These numerical passes did not validate candidate execution, so no timing ran on that ineffective selector.

The repair enables F16 large-pipeline creation only under the exact experimental flag/device condition, while keeping generic F16 selection on medium/small tiles. Only the explicit long score gate can choose the large pipeline. Existing shared-memory admission remains intact. Rebuilt native tests passed6/6 per mode and traces confirm m65536/n256/k512 using128x128.

Each Vulkan host translation-unit build took about eight minutes. A single bounded extension of the first supervised build avoided discarding active compilation; the second build used a ten-minute bound from launch. Runtime drop-ins and attempts to extend limits are recorded. No compile overlapped inference timing.

## Screen

| Order | Large score tile | GPU prefill seconds |
|---:|---|---:|
|0 |Off |23.014 |
|1 |On |95.070 |
|2 |On |93.972 |
|3 |Off |22.662 |

The native CPU decoder was not used for these GPU suffix timings. The same cap library, FP32 shaders and checkpoint were used in both arms; mapped libraries and flags were captured per run. Timing traces were off. Both final-arm states scanned finite. All runs kept49152 cached/1022 evaluated/1 predicted tokens, zero trial swap and the6GiB reserve. The4x slowdown justified no further confirmation, full64K workload or deployment gates for this candidate.

The current B0 release was restored after each maintenance stage, with exact maps/argv/flags, tools/cache and zero swap verified. No speech services were restarted, no production kernel changed, and no B2 baseline was created. The new pipeline, source, failed-selector evidence and raw results remain available as a documented negative result.

Offline audit/dispatch tests:2 pass,11 assertions. The wide tile may increase register/shared-work pressure or reduce effective scheduling efficiency; this screen establishes the cost, not a proven instruction-level cause. No second unrelated GPU candidate is justified by the present profile and budget.
