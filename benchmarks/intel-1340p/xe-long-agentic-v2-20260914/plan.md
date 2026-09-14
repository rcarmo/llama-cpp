# Long-task protocol v2 — prespecified before new model runs

The original CPU attempt hit its per-response1024-token cap during a prose/code explanation after4reads, completing0milestones. Its source/freeze/artifact/metrics remain under xe-long-agentic-20260914;no copy/share arm will run on that protocol. It is a retained task failure, not a successful before result.

Apply these two changes equally to all3arms before freezing v2:
1. System instruction sends code directly through write_file,onefile/toolcall,no proposed implementation in prose;completion at most2sentences after visible tests.
2. Per-response native/runner cap2048tokens (from1024). Totalgenerated cap12288,48rounds,32Kcontext,1200s16GiBZERO swap6GiBreserve remain unchanged. Fixture/spec/visible+hidden tests unchanged byte-for-byte.

No default model,Q6,MTP,routing,seeded prompts,testexpectations or source artifact repair. CPU/copy/share native routes still use samebinary;retain selective-viewfilter/normalexceptionrestore selftest. Recompileonlycaller conditionalcap,newbinpath;libraries/plugin unchanged. Fresh build/control/vocab admission before any trainedwork. Earlier harnessreference9tests neednotrerun iffixturebytesmatch.

New modelIDs/order:long2-cpu-0,long2-copy-0,long2-share-0,long2-share-1,long2-copy-1,long2-cpu-1. EveryrunfreshseparateADMIT;allarmsstartfromoriginalseed. No newmatrixresultsuntilone completes;gradefailure/outputbudgetfailure remains a taskfailure. Do not chase multiple further protocolchanges without reassessing usefulness. Compare successful whole-tasktime and weighteddecode tok/s,flag differentwork;do not credit shorter failed arms.

The user requested CPUbaseline and long agentic before/after,so neither GPU-onlynor numeric-sequence shortcuts meet the goal. No services/deployment/productioncode changes.
