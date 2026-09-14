# Value-attention 3x4 candidates: correct, no confirmed gain

Neither value-only candidate earned adoption. The second variant's independent eight-run confirmation measured **9.1361 to 9.1441 tok/s (+0.088%)**, while median request wall time increased **0.945%**. B0-score3 remains deployed unchanged; no B1 baseline is created.

## Candidate sequence

B0's current profile attributed3.004s of instrumented node wall to long n4 value attention. The first candidate reused the existing3x4 matrix block for m512/k>=32768/n4 F16 values and scheduled12-row jobs rather than score3's48-row jobs. All score3/smallbatch settings remained enabled, and the original2x4 value path was the flag-off control. Eight threads get43 jobs at m512. The final two output rows use the existing2x4 block. Reference execution and unsupported shapes stay excluded.

The native matrix suite contained21 cases per mode: long reductions32768/32776/64768/65024/65536, n1/3/4, a padded row stride, below-threshold and unaligned widths, shortSWA and score controls. All21 passed in both modes for both variants. Traces confirm the intended aligned long n4 value shapes; n1/n3/short/score controls retain their previous paths.

| Candidate | Screen decode | Screen request wall | Decision |
|---|---:|---:|---|
| Default compiler unrolling | +0.228% | -0.821% | Too small/overlapping; inspect assembly |
| Value-only reduction unrolling disabled | +0.631% | -1.070% | Better screen; independent confirmation |

Each screen used four ABBA runs, two/profile; their medians are the arithmetic mean of the two observations. Baselines were measured alongside each candidate, not borrowed from the earlier score3 campaign.

## Assembly evidence

The first candidate's main long reduction was unrolled by two. It spilled two vector accumulators to0x80/0xa0(%rsp), loading and storing them inside the loop. The second variant duplicates only the value block helper and applies Clang `unroll(disable)` there, leaving the score3 helper and the flag-off B0 path unchanged. This reduces loop stack traffic but does not remove every spill. Source and extracted assembly are retained for both variants. A compiler-mechanism improvement is not sufficient evidence of faster requests.

## Independent confirmation

The no-unroll finalist ran a separate ABBA/BAAB block, four observations/profile. Every run restored64658 cached tokens, evaluated25 and generated128, with the same three-key recall, identical output hashes and90/110 draft acceptance. Tracing/profiling were disabled. A live candidate worker's argv/flags/library hashes were captured separately in `runtime-provenance.json`.

| Median | B0 flag off | Value3 no-unroll |
|---|---:|---:|
| Decode |9.136053 tok/s |9.144061 tok/s |
| Request wall |15.507743s |15.654330s |

The screen's small benefit did not survive independent confirmation. No ambiguity block, further variant,512-token extension or promotion qualification is justified for this hypothesis. The patches and native evidence remain useful research artifacts. Closing this hypothesis does not discard B0's validated score3/ATTN4/smallbatch gains.

All recorded native/timing runs respected the6GiB/16MiB guards and had zero trial swap. The stopped-speech guard and supervised current-B0 restoration remained in place. After the final confirmation, B0 identity, all three base flags, mapped files, tools/cache and zero swap passed. No GPU, fresh long prefill or production candidate cutover ran.

## Scope and next work

This is one fixed64K counting/recall fixture, not a statistical proof of exact equivalence. The independent confirmation supplies no practical reason to spend additional qualification time. D04's conditional512-token/secondary-context and D05 adoption gates are not applicable to these non-selected candidates. D06 depends on an accepted value change, so no projection candidate is opened from this result alone.

Continue P01/P02 GPU prefill crossover tests from unchanged B0. The source investigation found `n_ubatch` fixed at context creation and included in compact-SWA allocation. Any256-early/1024-late scheme needs an explicitly measured fixed-allocation/slicing design before a whole-prefill claim.
