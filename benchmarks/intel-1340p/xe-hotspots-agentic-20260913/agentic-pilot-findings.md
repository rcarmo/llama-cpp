# First real agentic pilot: failure retained

Run `clamp-candidate-pilot`, candidate6c39dbe56library (sameO3CPUbackend), E4BGPUcoldinitial->CPU/MTPowner. Actual workflow usedread/read/edit/test/edit beforenativeguardfailure.512outmax/10round cap;43s,peak11.8GiB,sampledworker0swap,servicesunchanged. No goal success claimed.

1. Initial prompt324tokens, coldshared181,403,648KVbytes/0copy,firsttoken~9.9s. Context capacity8192 means payloadlarger than prior shortfixture;one sequence/allocatedvsused keptdistinct.
2. Model readsrc thenvisibletests;cachedprefix342then410tokensproves initial toolroundappend works. Actualeval50/109tokens.
3. Model edit replaced returnstatement with entireexportfunction, nestingexport. Toolran fixedBuntest insideisolatedcontainer and rejectedsyntax. Modelresponse then explained normalizedbounds but issued a no-opedit(before==after), previouslyreportedok. Reject no-opexplicitly from now; preserve old trace.
4. Lastresponse included prose+tool. Chattemplate re-render canonicalizes assistantcontent/toolsyntax, changing more than64tokens at tail. Arbitrary64rollbackguard aborted before allowing modelrecovery/finaloracle. This is benchmarktransport limit, not KVtransfercorruption. Change to protect previousINPUTprefix instead: priorGENERATEDassistanttail canbe canonicalized/replayed, countthose tokens. Earlierconversation rewrite stillrejects,don'thidecachemisses.
5. New report-only `--render-audit TARGET round-5.json` vocabulary-only path checks commonprefix ofrendered conversationprefixes (no modeltensors/GPUload). Mustpass beforecorrectedpilot.

Native process and all fixed tool containers drained; window released. The failed fixture and traces are retained without manual repair.

## Exclusive retry and renderer regression

Two corrected attempts were interrupted by external Go processes (PIDs 870891 and 871203). They are excluded from task and timing results. A subsequent three-way exclusive run, `clamp-candidate-exclusive`, had no sampled competitor, a 59.998s unit runtime, 11.8GiB peak memory and zero swap. Services did not change. It completed six rounds before another prefix rejection; no independent grade was reached.

The vocabulary-only renderer reproduces this rejection. At 12 messages the prompt has 1169 tokens and the old guard protects 1166. At 14 messages the longest common prefix is 1164. The changed suffix is:

```text
old: I will apply this change.<turn|>\n<|turn>model\n
new: I will apply this change.<|tool_call>call:edit_file...
```

Gemma reopens the previous model turn when a subsequent assistant calls a tool. The old guard wrongly included the two closing-delimiter tokens. Evidence: `evidence/render-exclusive-diagnostic.json` (expected failure). The diagnostic loaded vocabulary only, skipped model tensors and used no GPU. Its container was removed and the window released.

The report-only correction excludes the generation suffix and Gemma closing delimiter from the protected token boundary. An independent append-only JSON check rejects altered prior messages, tool definitions and injected assistant messages. The renderer audit includes four mutation cases and a later user follow-up. The corrected caller now builds and passes three vocabulary-only traces: 6, 7 and 8 rendered prefixes (21 total), including the exact failing transition and a subsequent user follow-up. Each trace also rejects four append mutations (12 total). Four tool tests with 25 assertions pass. Source and binary hashes are in `evidence/render-fixed-identity.sha256`. A first regression-script invocation omitted container stdin and failed before compiling; adding `-i` produced the verified run. No corrected trained retry has run yet. The timed-out delegate review is not a review pass.
