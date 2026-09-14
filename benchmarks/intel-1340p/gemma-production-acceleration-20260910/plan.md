# Approved acceleration rollout

User approved the best measured production configuration at21:45UTC, asked to commit/push, and set acceleration completion before decode optimisation at21:49UTC.

## Scope

Keep the original alias and localhost8091 API, retained CPU binary, decode8/prefill16, MTP3, F16/FA-off,1024/256 batch and two128K slots. Add a separate process supervisor/proxy with the previously tested Vulkan FP32 selector and microbatch256. Do not change split-K, enable CPUFA or use GPU1024. Target source under tools/gemma-hybrid; keep measured binaries pinned outside mutable report directories for deployment.

GPU eligibility: cold text-only chat,4096..65536 inputtokens, no speech work,>=6GiBreserve, no active CPU request, bothslots still within retained64K GPU qualification bounds. Above64K or unsupported request features use originalCPU; this is CPUrouting, not a claim that fullypopulateddual128Kmemory has been qualified. Keep existing CPU context settings. GPU stops before firstCPUdecode. Warmowner requests stayCPU. Serial admission protects transfer/slot ownership; two cached conversations remain available but model requests queue, explicitly trading simultaneous execution for bounded memory/ownership.

Direct CPU SSE bytes and tool deltas are forwarded without generating fake streaming output. Queue ownership lasts until body completion/cancel, not just response headers. Transfer must restore allbutfinalprompttoken. FailedGPU work before decoding cleans transfer+targetslot and fallsbackCPU; never replay response/tooloutput after transmission. Disconnect aborts upstream request and drains targetslot before furtherdispatch. CPUexit is supervisor-fatal: systemd kills allchildworkers and restarts a freshgeneration; GPUexit must not drop retainedCPUowners. GPUresource/speech guards kill onlyGPUwork and failthataccelerationphase; preserve CPUavailability.

## Persistence and security

Private runtime workdirectory0700; transferfilenames are generated,never user-controlled. No prompts or outputs logged. GPU statefiles deleted after transfer or recovery; no model weights/secrets inGit. Prefixowner state lives only as long as CPUworker generation. Parent restart terminates bothworkers throughsystemd KillMode=control-group. Allowlist proxy routes; reject unsupportedmutatingserverconfiguration. Same local-only exposure ascurrentservice.

## Gates before changing production

- Offline tests: boundedFIFO,queuedcancel,streamlifetime,bodylimits,prefixmatching,twoowners,errors/cleanup,fallback,nontext/oversizedGPUbypass,fixtureconverter tests.
- Native staging: coldhandoff+warmtools/SSE; two independentowners; cancelqueued/prefill/decode; GPUkill->CPUfallback; CPUkill->wholegenerationrestart; health/models/props/slots passthrough.
- Freshspeechclearance and saved originalunit/config/hash; supervisedmaintenance withautomaticrollback unless explicitpromotionmarkerwrittenaftertests.
- Preserve originalunit/environment/cachefiles and retain a one-commandrollback. Verify productionendpoint serving acceleratedcoldrequests andwarmCPUreuse before declaringdeployed.
- Commit/push code/tests and evidence toverifiedrcarmofork. Do not describe staged or offline-only work as deployed.

## Next phase

After accelerationrollout passes, saved64Kdecode-only profile to identifytargetverification/draft/packing/kernel costs. Existing thread/MTPdepth/FA screens are complete; no repetitionwithoutnewquestion.
