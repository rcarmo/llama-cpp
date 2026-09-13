# Agentic benchmark contract

Do not claim task success from model prose, tool-call formatting alone, or numeric generation. This harness must perform real tools against isolated code fixtures and pass independent test oracles.

## Native process

`agentic-session TARGET ASSISTANT [--cpu]` is a private report-only JSON-lines process. Request contains `id`, complete OpenAI-compatible `messages` and `tools`, bounded `max_tokens`. Response contains parsed assistant/tool message, raw text, actual prompt/cache/evaluated/decoded token counts, KV positions and timings. No HTTP port or service deployment.

Cold candidate/baseline: same modelGGUF/template, GPUweights/KV, prefill, wholecontext handoff once, freeGPUcontext/model, CPUassistantMTP3. CPUreference: load only CPUtarget, no handoff, identicalretainedCPU/MTP generation. All subsequent rounds remain on CPU. Difference baseline/candidate is LD_LIBRARY_PATH selecting prior6c39parent or allocation-levelcandidate library; same nativeharnessbinary intentionally holds request/render/generation constant. Record loadedmaps and filehashes to prove selected library. There is no per-round process restart.

Renderer uses common_chat_templates_apply with fixed date, real schema, thinkingdisabled, paralleltoolcallsfalse. Output parser uses commonChatPEG format/parser from the same rendered prompt. Warm requests must append to the exact prior JSON messages, including the returned assistant message, and retain the tool definitions. At the token level, protect the prior input after removing its generation suffix and, for Gemma4, the final `<turn|>\n` delimiter: the template removes that delimiter when reopening an assistant turn for a tool call. No message content is removed by this boundary rule. Count every evaluated suffix token and every discarded evaluated token. The original 64-token rollback limit failed on a prose-plus-tool response. The subsequent guard failed on two closing-delimiter tokens. Both failed traces are retained; vocabulary-only regression tests cover these transitions and reject message/tool mutations before a new trained run. History contains evaluatedKVtokens only; finalsampledtoken is pending and must be evaluated on append, not fabricated as cachehit. Record pre/postKVmax,historylength,actualevaluatedprompt. On parse/decode/cancel/ownership error, process dies and testcase fails rather than recycle a damaged owner.

## Workflows

Three independent small TS repositories:
1. clamp wrongformula/reversedbounds; followup rejectNaN.
2. median lexicalsort/evenlength/emptypolicy/mutation; followup rejectnonfinite.
3. normalizeconfig defaults preserve0/false/emptystring; followup validnonnegativeintegerretries.

Each workflow: initial request -> real tool loop -> independentinitialgrade -> followuprequest -> realtoolloop -> independentfollowupgrade. Max10modelroundstotal,4toolcallsperresponse,512outputturn,8Kcontext,570snativeworkflow deadline. Failure counts: parser failures, any output truncation, failed tests, test tampering, tool escape, context limits, timeouts and exhausted round budgets. Exit 0 requires two passing independent phases and successful edit/test tool use. Exit 2 means a completed task failure; exit 1 means a harness/resource failure. Independently grade the final artifact on budget exhaustion without feeding hidden results to the model or extending the run. Preserve all traces; never restart until success and report only that run.

Allowedtools read_file/search_files/edit_file/run_tests. Noarbitraryshell. Relativefixturepaths,symlinkrejection,sourceonly editsafterread,uniquematchingbefore/after,bounded16KiBfiles/results. Fixed Bun test runs inside shortlivednetworknonecapdropallread-onlyfixture/runtimecontainer256MiB/1CPU/pids32;hostkeychainenvnotinjected. Hiddenoracle copiedto freshindependent read-onlyfixture, originaltesthashprotected. This is an isolated functionaltest environment, not hardened hostile multitenant service; kernel/container security assumptions documented.

## Measurement

Report per-case totalworkflowwall, coldTTFT/handoff, eachwarmroundTTFT and evaluated/cachetokens, output/verification/draftacceptance,toolwall,finalteststatus and task success. Compare time-to-correct-solution, not toks/s alone. Token/traces may differ between CPU vs GPU-prefill; independent tests are primary acceptance, exactoutputs diagnostic. baseline/candidate samekernelarithmetic ideally match tools/work; if differing workflow cost, show both rawmetrics and case success, don't call fasterfailedcasewinner.

The corrected candidate clamp pilot completed ten native/tool rounds but exhausted the task budget; post-run grading rejected its unchanged final artifact. Next diagnostic controls: one baseline-library clamp run and one CPU-only clamp run, with the same fixture, prompts, sampling and 10x512 limits. Both use the corrected outcome classifier and final-artifact grade. These controls diagnose whether failure persists without batching or without GPU handoff. No workflow speedup claim is possible from faster failed tasks. Do not repeat the candidate solely to chase success. After these controls, freeze the three-fixture comparison order and any justified harness changes before collecting further runs. Each run requires fresh admission. Numeric profile benchmarks only qualify narrow kernel behaviour.

## Isolation and safety

Systemd-owned per-workflowunit runtime600s/MemoryMax16GiB/SwapMax16MiB/hostreserve6GiB. Nativegroup killed on fail; taskcontainers nameduniquely and ownedbyharness,cleanup sweeps ONLY its recorded names. Speech/Gemma units remain inactive/nochange. Same-host model/GPU/exclusiveheavyCPU admission explicit; resource guard sample200ms and no overlapping go/media/model work except fixture testcontainers after inference response. Admission JSON must match the exact unique run ID and have a finite future expiry; prior or duplicate admissions cannot authorise another run. On completion release the exact ID to both held peers. Cross-session messages are restricted to operational coordination.
