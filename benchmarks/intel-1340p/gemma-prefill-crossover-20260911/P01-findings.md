# Fixed allocation and active prefill cap

Retained GPU server build11154 uses source4e9740248. At that revision, src/llama-context.cpp:248 fixes n_ubatch at construction; src/llama-kv-cache-iswa.cpp:73 sizes compact SWA as512+n_ubatch (padded256 for this model). include/llama.h exposes a getter, no live setter. Server logical batches still pass through llama_decode and memory->init_batch.

The isolated patch keeps maximum1024 allocation but selects256 or1024 for causal Gemma4 text batches >4 tokens at init_batch. No scheduler/model dimensions mutate after allocation. The environment cap is static for these position experiments; a threshold selector needs separate implementation/testing after measurements. Existing padded capped768-cell KV export and FP32 Vulkan backend are retained.

The4K trace proves actual256 microbatches. Saved state is finite; restrictedv3/v2 conversion and B0CPU4095cached/1eval handoff pass. True256 versusmax1024/active256 four-run allocation control:27.442s versus27.307s(-0.49%),n2/profile. This is4K-only evidence, not proof of long neutrality.

Failures preserved: ccache launcher permission, wrong token identifier in initial patch, INFO trace suppressed by server log policy, finite-scanner JSON schema mismatch, destination directory absent. Compile/trace/parser fixes did not require repeating the completed decode tests. Saved GPU state was reused for CPUhandoff after parser correction.

Next: missing16K/32K/48K identical-prefix1022-token suffix comparisons with max1024 fixed in both arms. Oneprefixchain creates reusable states. Native actualdispatch/finite checks precede any threshold or full64K benefit claim.
