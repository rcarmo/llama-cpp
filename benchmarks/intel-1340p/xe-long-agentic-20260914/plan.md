# Long agentic task: CPU-only, copied KV and zero-copy

Rui requested a long agentic before/after comparison, then explicitly added a CPU-only baseline. This is a new experiment; prior short numeric-sequence and miniature coding results remain immutable.

## Arms and control

- CPU: prefill and all decoding on CPU, no GPU backend loaded and no handoff.
- Copy: GPU prefill followed by synchronous bounded copied-KV CPU handoff.
- Share: same GPU prefill/allocation followed by zero-copy shared-KV CPU handoff.

Same current qualified CPU/native-source/common libraries, Gemma E4B Q4 target, Q8 MTP assistant, greedy sampling, MTP3,8decode/16prefillthreads,F16KV/FAoff,context32768,batch/ubatch256. Q6 opt-in ON in every arm, so this does not attribute Q6 differences to zero-copy. Copy and share use identical current O3 Vulkan plugin and cached/coherent source allocations. Only view-procedure discovery during transfer changes; registry callback restored immediately. CPU baseline skips GPU/model residency entirely. Full startup/prefill cost remains in total task time.

## Coherent long task

A multi-file TypeScript usage-reporting library progresses through four cumulative milestones:normalise events to UTC day;aggregate accounts/days;compose totals/reports;idempotent retry IDs with conflicts. The repository includes a real contract,typed modules and cumulative visible tests. Independent hidden tests grade each milestone; the reference implementation and hidden files are never mounted/readable by model tools. The agent performs actual reads,writes and sandbox tests; no prerecorded completion or sleeping/padding to create length.

A single persistent conversation owns the cache across all milestones. Report actual prompt growth,completed turns,toolcalls and generated/evaluated/drafted/accepted work. Planned cap48turns×1024tokens,total12288generated tokens,1200s,16GiB/ZERO swap/6GiBhostreserve;single tool256MiB10s16KiBoutput. Context capacity is not claimed populated context. A context/output/round failure is retained, not fixed by editing an artifact or increasing limits mid-comparison. Report realised task length even if shorter than expected.

Freeze fixtures/tools/caller/libs before trained work. Qualify original seed failure, reference success,cumulative tests,hidden-oracle isolation,symlink/traversal rejection and source write bounds offline before models. Build caller-only changes under an explicitly admitted compile window;native control selftest and vocabulary checks separately admitted. No production kernel/source changes intended.

## Measurements and decision

Each arm starts a new process/fresh fixture;page-cache state documented. First measure one valid run per arm in CPU/copy/share order;if no harness failure, complete reverse share/copy/CPU to balance order (two independent observations per arm). Qualify correctness before interpreting speed; no extra unchanged retries to select wins.

- Primary: cumulative independent milestone grades/final artifact and whole task completion time,including startup,prefill,tools and handoff.
- Phase metrics:process/roundfirsttoken,prefill,handoff,tool wall,warm native time and post-first-token decode tok/s weighted by token intervals across turns. Do not average per-turn rates unweighted. Include effective generated tokens/tasksecond separately.
- Work parity:prompt/output hashes,tool trajectories,generated/evaluated/MTP work. CPU/GPU reduction differences may alter tokens without invalidating task quality. Mark noncomparable work;do not credit shorter answers or fewer completed phases as kernel speedups.
- Record shared/copied bytes,coldvswarmownership,actual prefixcounts,loaded CPU/GPU libraries,full resource/cleanup evidence. Modelhashes,sourcebuildidentities and exactlimits retained.

All model/build/native runs require fresh exact three-way admission via @whisper and @go-264. No rollover or old admissions. Stop only owned workers on contention/limit/failure;preserve evidence and release after complete drain. No deployment,services/defaultchanges,modelweightswrites or oldbenchmark reruns.
