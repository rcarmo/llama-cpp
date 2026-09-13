# Trained Q6 opt-in qualification

First run one `q6trace` clamp workflow with the actual target/assistant and write-v2 tasks. It must pass both independent grades, preserve KV/history invariants, map the isolated CPU library, and emit `XE_Q6_DISPATCH m=262144 n=4 k=2560` from target verification. This diagnostic trace run is not a timing result.

If that passes, freeze the generated Q6 runner and use four separately admitted unprofiled clamp workflows in OFF/ON/ON/OFF order. Keep candidate allocation-batched zero-copy handoff in both arms and the same isolated CPU library; only `GGML_XE_Q6_PAIR` changes. Trace is disabled in all four timing arms. Record exact prompt/generated work and all grades; failure/contended runs stay visible and are not speed wins.

Optional confirmation across median/defaults follows only if a decision needs it; do not automatically repeat the complete prior matrix. Synthetic and actual GGML backend checks already established bit equality, but trained timing and task behaviour remain new gates. Existing width1/other width/type/layout/default routes remain unchanged. The report-only opt-in is not a merged production implementation.

Limits per trained run:600s/16GiB unit,<=16MiB worker swap,>=6GiB available reserve,10 rounds x512 output,8/16threads,MTP3,initialGPUprefill then CPU-owned continuation. Explicit exact run ID/arm/series admission and release of both peers required. No services/deployment/weight changes.

After qualified gains, promote a scoped portable implementation to the repository with architecture guards and focused regressions, then measure it with any qualified Vulkan changes. User requires final merge into main/master and benchmark progress charts after the full goal is reached; charts must show failed/regressed candidates and avoid adding speedup percentages.
