# Archived checklist before the 11 September 06:45 UTC reset

Historical state, not the new work queue. Completed evidence and failed attempts remain in their original benchmark directories. The two incomplete lifecycle/capacity items below are carried into the new plan with narrower, current wording.

> Reopen the evaluation: cross-backend token drift is a diagnostic, not proof of corruption or quality regression. Retain completed measurements and controls; do not repeat them without a specific need. Prioritise F16 GPU cold-prefill -> CPU/MTP, evaluating state integrity, task-quality non-regression and end-to-end benefit against production CPU16. Q8 remains slower in existing measurements, not rejected for drift. Preserve valid memory constraints. Before heavy work coordinate speech idleness, stop production Gemma under the existing maintenance approval, then restore and verify it unchanged. Temperatures >=95 C remain annotations; rollout requires separate approval.

The following preserves all 38 checklist items and their status; descriptions are normalised for readability.

- [x] 01 Replace parity-only acceptance with state integrity, same-prefix numerics, task non-regression and measured benefit.
- [x] 02 Retain CPU/FA/quant controls, Q8 CPU self-restore, compact-SWA fallback and balanced4K handoff evidence.
- [x] 03 Correct reports/memory:16K equivalence was unmeasured; parity-only rejection withdrawn, measured Q8 latency disadvantages retained.
- [x] 04 Prespecify fixtures, hard checks, blind0-4 rubric and historical <=5pp task-loss/<=0.25 score tolerances, with baseline failures and uncertainty.
- [x] 05 Verify speech/native/LLM idle and saved baseline; bounded approved maintenance with automatic restore.
- [x] 06 Validate identical-prefix KV layout, target-only self-restore, final-token-only GPU->CPU route and cached tool appends.
- [x] 07 Teacher-forced4K probabilities at six positions: self-restore unchanged, transfer drift within CPU/GPU envelope; retain top256+other limits.
- [x] 08 Complete repeated GPU-prefill/CPU-MTP coding/recall/tool loops; retain arithmetic failures and retrieval-pair correction.
- [x] 09 Blind rubric: repeated explanation means equal but poor; retrieval pair favours CPU; uncertainty retained.
- [x] 10 16K recall passes; diagnose real32K NaNs, fix large-softmax reduction, verify finite target/MTP recall and append.
- [x] 11 CPU16 comparison: balanced cold42.1% faster,16K pair42.3%,edit32.8%; warm16.1% slower; retain cache/repetition limits.
- [ ] 12 Compact-SWA/export/v3-v2 alignment enables one64K request with >=16.1GiB available; fully populated dual128K/fallback capacity unverified.
- [x] 13 Historical matched full-SWA two-stream transfer passes, superseded for long contexts by compact padded export and validatedv3->v2 conversion.
- [x] 14 Retain Q8 measured disadvantage; do not escalate Q4 during F16 numerical failure unrelated to capacity or harmless drift.
- [ ] 15 Owner prototype/native matched-layout tests and44 mocked lifecycle tests pass; the old checklist still called native crash/respawn/live adapter unverified. Later item32 supplies some native coverage; every-phase cancellation and capacity remain open.
- [x] 16 Historical production identity/cache/tools pass; implicit empty-response failure retained;918-file verified archive delivered.
- [x] 17 Diagnose coding warm slowdown as mostly decoding; choose compact padding and original CPU alignment for memory-safe >32K work.
- [x] 18 Compact export/converter pass8offline tests and4K native handoff; failures retained.
- [x] 19 Aligned64,663-token finite handoff/recall/append;8coding runs whole28.79% faster,warm3.42% slower; restored/checkpointed.
- [x] 20 Saved64K profile: matmul68.5%,softmax9%; CPU8/MTP3 best measured,FA slower/invalid,1024tail faster/full slower; retain256.
- [x] 21 Bounded768-cell export4K/64K; split-K2/4/8 screens,split4 neutral timing but native improvement; retain candidate.
- [x] 22 Best measured default and alternatives recorded; source/evidence55055e1a1; global optimum/lifecycle then unverified.
- [x] 23 Fork policy596d58e0a,skillda5416a38,aligned evidence5d586ff93/tuning55055e1a1 pushed; no upstream submission.
- [x] 24 CPUFA4K/64K recall passes but slower thanFAoff; isolate masked/tile/value costs and candidate helpers.
- [x] 25 CPUFA fused SIMD8runs: request-9.59%,decode+10.16% versusFA baseline; native/finite/tools pass,ea0d0fb72; FAoff still faster.
- [x] 26 Historical production restored602513; proceed with GPU attention experiment under fresh clearance.
- [x] 27 IrisXe long-attention FP32 selector; smaller tile slower; native6/6 and8tails confirm8.10% gain.
- [x] 28 Fresh64663 FP32 request691.385s,7.42% below temporal control; finite/native1tokenhandoff/cache pass; historical612228 restored.
- [x] 29 GPU checkpoint0bdd7cd8b,170-file source reconstruction,4tests21assertions and restoration verified/delivered.
- [x] 30 38666-token codingABBA4/4pass,FP32prefill2.09%/route1.99% faster,warm0.56%;213tokens4rounds;f37a5c941/136files.
- [x] 31 FP32+1024:8tails7.11% faster,butfresh64K715.246s/3.45% slower; finitehandoff/cachepass;d5cd05b25/147files,retain256wholeprefill.
- [x] 32 Authorised hybrid8091 deployed20260910-sse1;FP32GPU256cold4K..64K->CPU8/16MTP3,serialqueue/twoowners;20tests58assertions,nativeGPUkillfallback/CPUrestart/SSEtools/cache;75a880bab/01d414a25.
- [x] 33 Smalltargetbatch<=4 rows uses8threads;8runs7.30->8.51tok/s(+16.52%);4K/finite/tools/cachepass;20260910-smallbatch,4104e7827/bb52bbfa2,247-file archive.
- [x] 34 Longer64K coding gains23.34%/23.95%,all original tasks fail truncation/export-name; samework/code; alias-onlydiagnostic retained;a2700717a/159files.
- [x] 35 Draftdecode4vs8:8runs4threads4.10% slower,same128outputs/draft90of110;keep8,e95b8286a/95files.
- [x] 36 F16pair0.84%slower/n1only; exactn4 2x4tile+2.90%,overlappingranges;20260911-attn4 deployed,native/finite/SSEpass,92sampleszeroswap,firstabort retained;32119740a/281files.
- [x] 37 Score-only3x4 native11/mode/alltails,8runs+3.12%;baseline4Kqualification speechqueueabort,ownedKILLafterTERM;ATTN4restored666271/666288;6offline tests26assertions,f6db76c52/148files.
- [x] 38 Resume after owner stopped speech:4K70.963/69.296s,finite/tools/cachepass;06:25singleSSEcutover92sampleszeroswap/min17.07GiB;LIVE20260911-score3-stopped689006/689029,ATTN4rollback;8863994d8/a750ff990,74files,10tests38/adapter26tests78.
