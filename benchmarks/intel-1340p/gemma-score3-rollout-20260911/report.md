# Score3 decoder deployed after resumed qualification

The score-only 3x4 decoder is live in `20260911-score3-stopped` on port 8091. The remaining 4K prefill, finite64K, independent tool-slot and production SSE gates passed after Rui explicitly stopped both speech services. The earlier eight-run comparison is unchanged: **8.6634 to 8.9341 tok/s, +3.124% median decode**, with **2.988% lower request wall time**. No native numerical or throughput comparison was repeated.

## What resumed

The earlier campaign stopped during a baseline 4K prefill when the speech receive-queue guard fired. Its failed native log, guard event, owned-process shutdown and restored ATTN4 evidence remain in `../gemma-decode-score3-20260911/`. That checkpoint was experimental, not deployed.

At 06:17 UTC, Rui asked to continue after shutting speech down. The speech owner completed shutdown of both `whisper-stt.service` and `whisper-stt-diarizer.service`, including the native process left after a timed-out stop. Both units were then loaded/inactive/dead with MainPID 0, ports 8092 and 8701 absent, and no speech native workers. The LLM session did not restart or modify speech. Rui also instructed the speech owner not to interrupt testing.

A new evidence directory preserves this resumed work without overwriting the failed prefill or completed native/timing runs. The candidate CPU backend is byte-identical to the earlier measured build. The later trial HTTP-abort/owned-process-stop fix was used for qualification; it had already passed offline tests.

## Qualification results

| Gate | Result |
|---|---|
| Baseline ATTN4 4K prefill | 70.963 s, 4096 evaluated / 1 generated |
| Score3 4K prefill | 69.296 s, 4096 evaluated / 1 generated |
| Single-pair prefill difference | -2.349%; within the prespecified no-more-than-5% slowdown gate |
| 64K recall | Correct, 64662 cached / 1 evaluated |
| Saved state | Finite, zero NaN and zero Inf |
| Independent tool slot | Correct `lookup_stock` call and quantity `23` |
| Preserved long append | Correct `MAPLE-726`, 64684 cached / 15 evaluated |

The 4K prefill is outside the score3 long-attention gate. Its single-pair difference supplies limited non-regression evidence, not another kernel speed claim. Qualification kept target smallbatch and ATTN4 enabled in both modes, CPU8/prefill16, draft8/16, MTP3, F16 KV, FA off and batch/microbatch 1024/256. No new long GPU prefill ran.

All three CPU qualification runs stayed above the 6 GiB available-memory reserve and recorded zero worker swap. ATTN4 was restored and its identity, tools and growing cache verified before the conditional cutover.

## Deliberately stopped speech

The prior adapter required a working speech jobs endpoint even when the owner had stopped the service. An explicit configuration field, `speechMode: "stopped"`, now supports this operating state. The default remains `active` and still requires valid terminal job metadata from the API.

Stopped mode checks all of the following on admission and during GPU work:

- Both named systemd user units are loaded, inactive/dead, with MainPID 0.
- Neither speech port has a listener or established connection.
- Neither `diar-server` nor `whisper-cli` exists.
- Status commands succeed within their timeout; malformed or missing state fails closed.

It does not interpret a refused connection as idle. Unexpected reactivation blocks the GPU path. CPU fallback remains available under the existing adapter policy. To restore accelerated operation alongside speech later, deliberately change the adapter profile back to `speechMode: "active"` and revalidate it; restarting speech alone does not silently change the policy.

The existing native activity, socket, GPU memory and per-worker swap checks remain in place. GPU startup requires 12 GiB available memory; continuous work requires 6 GiB and no more than 16 MiB worker swap. The cutover smoke also monitors CPU phases. Periodic checks bound response time; they do not provide exclusive access to the host.

The change is limited to `workers.ts` calling the new `speech.ts` helper plus the explicit profile field. All other serving code and the GPU profile are unchanged. A delegated read-only review found the state handling fail-closed; suggested malformed-output, duplicate/swapped-unit and established-socket tests were added. Adapter tests: **26 pass, 78 assertions**.

## Production cutover

One supervised, rollback-backed cutover passed at **06:25:20 UTC**. The smoke verified:

- A cold 5236-token `gpu-cold` request with native SSE termination and tool-call deltas.
- CPU handoff with 5235 cached tokens and one evaluated token.
- Correct tool results with both `none` and `auto`, followed by a cached `RESTORED` append.
- Exact CPU argv, all three experimental flags and nine pinned mapped files.
- Two idle 131072-token slots, zero CPU swap and no surviving GPU worker.

All **92** diagnostic samples recorded zero CPU/GPU swap, with a minimum **17.072 GiB** available RAM. No speech or resource guard fired. This short smoke verifies serving integration; earlier native and 64K qualification cover the long score tile.

Final live verification found supervisor/CPU **689006/689029**, active service, zero restarts, zero cgroup swap, no running trial units and no pending rollback timer. Speech remained stopped. The immutable previous `20260911-attn4` release and its saved unit are the rollback target. The local `rollback.sh` restores that unit; its active-speech policy will use CPU fallback while speech stays stopped.

## Reproduction and scope

- Measured candidate/source checkpoint: `f6db76c521fdad73211d23844617c62312bfdafa`.
- Stopped-speech guard code checkpoint: `8863994d8`.
- CPU backend SHA-256: `f288945950f823924282dc70f5d1b68ea8750f0b4ab29adb14e4db5016468ba1`.
- Release: `/var/home/agent/.local/share/llama-gemma-hybrid/releases/20260911-score3-stopped`.
- Rollout audit/helper tests: **10 pass, 38 assertions**. The source experiment retains its separate six tests and reconstructable native/timing evidence.

Run `bash verify-offline.sh` in the versioned rollout export to verify file hashes and the saved qualification/deployment evidence without inference. Runtime binaries, models, KV files and private baseline configuration are excluded. Historical maintenance scripts need the retained local files and a current baseline; they are not instructions to replay deployment.

The earlier ATTN4 GPU-startup swap event remains unexplained and is retained in its own campaign. Fully populated dual128K operation, broad long-context coding-contract quality and cancellation during every native phase are still unqualified. This rollout establishes the measured incremental decoder and its checked serving path; a global decode maximum has not been established.
