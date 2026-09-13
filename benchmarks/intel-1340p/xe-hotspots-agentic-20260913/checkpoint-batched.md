# Allocation-level handoff checkpoint

Code commit6c39dbe5665e3e772109a0c02598283b4d0fc434 pushed/remoteverified after CPUtests. Updated `llama-kv-cache-handoff.cpp`, private callback contract, native tests and API docs. One complete mapped view per sourcebuffer replaces per-tensor view acquisition. Null capability cached; checked base and stream offsets share one retained view; copy fallback unchanged.

CPU gates: isolatedO3handoffTU relink into unchanged verifiedbaselineO3objects, noABIchange.3nativecache/plain/GemmaPASS. Tests assert singleview/memoryaccounting/offset/lifetime/clear/nullcapability and ISWAsecondallocationfailureatomicity. Registry unchanged.

Physical Xe synthetic gate: existing tinyGemma4 full512/SWA256 context test, checked copied-reference continuation after source/model destruction, `BATCHED views=2 view_ms=0.711`, all PASS. Unit354ms,69.3MiBpeak/swap0; process/maps/guards logged underbatched-native. A preceding preflight path mismatch failed before spawning native worker; retained emptydir+unitlog, fixed without model/GPU admission expansion. No trainedtiming measured for this change yet; don't equate tiny.711ms with prior4K85ms savings.

No ownedworker/container remains; both short windows explicitlyreleased. Fullgoal not complete: CPU/Vulkankerneloptimisations and realagenticbaseline/candidate benchmarking still open. Persistent reportnative owner compiled,toolfixture/sandbox4tests23assertions+actual isolatedbad/fixedhiddencheckPASS. Next candidateclamp initial+followup pilot requires new600s/16GiB admission.
