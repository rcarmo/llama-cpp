# First protocol stopped before a long-task comparison

`long-cpu-0` is a valid failed CPU baseline attempt. It read four fixture files, then generated a 1024-token prose/code response that stopped mid-code before a completed file-write tool call. It completed0/4milestones; the final seed artifact failed independent tests. No handoff or GPU plugin was loaded.

The failure is `round_output_budget`, not a runtime/resource failure. Guard verification passes. Five rounds generated1095tokens; runner wall122.123s, unitabout122.35s, peak3,240,947,712B,zero swap/memory events/throttling,minimumavailable25,930,460KiB. All CPU/MTP/tool workers and containers drained;services unchanged. These times are not a successful-task baseline.

Do not run the copied/shared arms against this incomplete protocol or mix it with a revision. Preserve original caller7047d0a7,31-file freeze,fullraw response,fixture andgrade. A new equally applied protocol must be frozen before any further arm:code changes only through file tools,no code/proposed implementation in prose,and2048tokens perresponse so a complete typed module/tool call can fit. Keep the same fixture/hidden tests,total12288generated cap,48rounds,32Kcontext,1200s16GiBzeroSwapbounds. Originalattempt stays separate from revisedmatrix.

The revision requires caller compilation and a new exact model admission; it is not retroactive success, additional budget for the stopped worker, or permission to repair its artifact.
