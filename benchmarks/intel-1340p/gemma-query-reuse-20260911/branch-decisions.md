# Conditional branch decisions

## H01/H02: two PMU profiles completed, attribution limited

The host exposes separate core/atom PMUs. User-space event groups opened successfully without security changes. Two fresh-worker saved64K profiles captured all34 native threads using separate core/atom groups (68 groups per run), four events/group: cycles, instructions, cache references and cache misses. Thread inventories were unchanged, each request completed with the frozen work counts, and production was restored afterwards.

Counter intervals cover the25-token tail,128-token generation and HTTP roundtrip. They do not isolate attention heads or operators. Kernel/driver traffic is excluded. Hybrid running/enabled ratios include time a thread cannot run on a particular PMU; they must not be blindly used to scale both PMUs to the entire interval. Core/atom event semantics are platform-specific. A read-only review independently concluded that request-wide counts do not establish shared-KV miss attribution.

The initial uncore probe supplied unsupported kernel/hypervisor exclusion filters and returned EINVAL. The corrected unfiltered IMC probe returned EACCES. No permission, sysctl or host policy was changed. There is no measured DRAM bandwidth or saturation result. Raw sysfs metadata, event encodings, counters, enabled/running times, compiler source and permission failures are retained.

## G01/G02: condition not established

Gemma's profiled score shape has eight query heads sharing two KV heads. The current low-level score call receives one head's matrix and runs team barriers per head. Query reuse is local to that call. Actual key sharing across heads would require caller-level head-call fusion or a newly synchronised shared lifetime; it cannot safely be achieved by retaining a pointer in the existing scratch helper.

The PMU results do not locate a KV-reload bottleneck. No G prototype or timing is opened in this bounded campaign. This is a conditional-not-run decision, not evidence that grouped-head reuse can never help.

## F01: quantified intermediates and design boundary

At64768 positions, four queries and eight query heads, one FP32 score tensor occupies8,290,304 logical bytes (7.90625MiB). F16 keys occupy132,644,864 bytes; keys plus values occupy265,289,728 bytes (253MiB). These are tensor sizes, not DRAM traffic. Softmax and score graph intermediates can involve additional buffers/reads; source snapshots retain the exact graph steps.

The old instrumented B0 profile attributed0.856s of15.874s node wall to the entire attention family, versus4.675s long n4 score and3.004s long n4 value matrix work. The attention-family counter includes all sizes and does not isolate intermediate-memory overhead. It does not establish that eliminating score buffers is a material new bottleneck fix.

A viable new prototype would require a true four-query online-softmax/value kernel, bounded128-position score tiles,8192-byte output accumulation and8192-byte query scratch per head, with explicit caller-level dispatch. It must preserve masks, scaling, softcap and sinks; reduction-order changes need reference/probability/task validation. Retaining FA-off V layout would avoid a new handoff conversion, but requires a competitive value traversal. Changing it requires separately qualified conversion and state/handoff tests.

The previous active-query FA experiments reached only1.46–1.67tok/s, and the confirmed fused-value FA improvement reached4.738tok/s, both historically below FA-off. These are retained negative feasibility controls, not new matched B1 timings. No new evidence identifies a specific fusion design that addresses those costs within this plan's bounded scope.

## F02/F03 and R01

F02/F03 close as conditional-not-run after F01 assessment. No simple FA-on replay or speculative broad rewrite is started. B1-query-reuse is qualified only for its measured saved64K decode scope; no claims about fusion, whole cold prefill or enlarged capacity are attached to it.

R01's experimental manifest is appended immediately after qualification. Deployment remains separate and unapproved in this turn: B0 stays live. The original self-restore-followed-by-append sequence was interrupted and remains unqualified; normal append and finite self-restore were validated separately. No generic all-lifecycle success is asserted. Future deployment must resolve any affected serving gates and use an immutable release plus timed rollback.
