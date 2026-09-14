# In-process Vulkan-to-CPU KV handoff

The experimental API moves an entire quiescent context's KV state into an empty CPU context. On eligible Intel UMA allocations, destination tensors use retained CPU views of the same Vulkan memory. Unsupported allocations can use an explicitly enabled, bounded RAM copy. No state file or whole-KV staging blob is used by the transfer.

## Build and use

Build with the normal CMake tool configuration. The executable is `llama-gemma-in-memory`:

```sh
cmake --build build --target llama-gemma-in-memory
build/bin/llama-gemma-in-memory model.gguf 'Write one short sentence.' 16
```

For optional Gemma assistant drafting after handoff:

```sh
build/bin/llama-gemma-in-memory model.gguf 'Continue the sequence: one, two,' 16 --mtp assistant.gguf
```

The assistant loads on CPU only after the GPU context/model are freed. The existing speculative engine drafts up to three tokens; the target's greedy sampler verifies them and rejected tails are removed from memory. `MTP drafted=... accepted=... output=...` is diagnostic, not a throughput result.

A Vulkan-enabled build or loaded Vulkan backend is required for sharing. `--copy-only` after the token count runs both contexts on CPU and exercises the RAM-copy fallback. A CPU-only build also uses fallback. The executable prints `HANDOFF shared_bytes=... copied_bytes=...` to stderr; a successful run alone does not prove sharing. The existing TypeScript hybrid proxy and its file-state route are unchanged.

The executable has a 4096-token prompt cap and 256-token output cap. It keeps history and a greedy sampler in the same process, prefills a source context, constructs a CPU context from the same model file, moves KV ownership, frees source context/model, removes the last prompt cell and re-evaluates that token on CPU before sampling. All later tokens append to the CPU-owned state. It is a diagnostic executable, not a serving endpoint or admission controller. Use an external resource supervisor for large models. Two model weight allocations can coexist during the transfer.

## API contract

Set `llama_context_params.kv_cpu_shared = true` on the source before context creation. The backend registry exposes `ggml_backend_vk_alloc_cpu_shared_buffer` and `ggml_backend_vk_buffer_cpu_view`; llama discovers them without linking directly against Vulkan. Unsupported allocation requests keep ordinary KV buffers. Initial implementation replaces initial KV buffers before graph creation, so temporary old/new KV allocation overlap must fit.

Call:

```cpp
llama_kv_handoff_result result{};
bool ok = llama_kv_handoff_cpu(dst, src, /* allow_copy */ true, &result);
```

Caller requirements:

- Serialise both contexts, all associated memory handles and inference calls. This synchronous API does not implement cross-thread admission or locks for arbitrary existing memory handles.
- Destination must have no cached tokens, no GPU weight layers, `offload_kqv=false`, and `op_offload=false`.
- Source/destination must use the same immutable model object or independently load the same local GGUF file snapshot. Snapshot identity uses file device/inode/size/timestamps on POSIX; it is not a cryptographic content hash. Do not modify files in place. Unsupported independent-file identity on other platforms rejects.
- Context/microbatch geometry, types, tensor strides, layer identities, KV streams, full/SWA ring capacities, rotations and RoPE configuration must agree. No transposition, ring resizing or quantisation conversion occurs.
- Plain KV and ISWA caches are supported. Derived, recurrent and hybrid caches reject unless they implement a separate compatible transaction. Shifted or pending-copy caches reject.
- Adapters, control-vector modifications, training, backend samplers, shared-model residency and active borrower contexts reject. Same-model metadata/tensor-geometry checks are additional guards, not a cross-model conversion.

On success, **source is consumed; only free it**. Do not reuse any previously obtained source memory handle. Source encode/decode reject, and `llama_get_memory(src)` returns null. All sequences move together. Destination owns independent tensor metadata, cell metadata and retained buffer wrappers; source metadata/model can then be freed. CPU writes must not race with any former source operation.

On rejection, return is false, result is zeroed and neither KV owner changes. Preparation allocates all views/copies and metadata first. Abandoning the transaction releases prepared buffers. ISWA prepares both caches before committing either. Existing graphs are drained and invalidated before the nonthrowing commit. Destination graph reservation occurs on its next decode.

Handoff acquires host visibility once per unique source KV allocation and retains one complete CPU view of that allocation. Tensor and stream metadata bind checked offsets inside it; padding and the original allocation lifetime remain retained, as with the earlier per-tensor Vulkan views. Unsupported allocation results are cached during preparation so they do not cause repeated capability probes. `memory_breakdown()` counts each retained allocation once.

`allow_copy=false` requires every tensor's source allocation to have a retained CPU view; unsupported allocations reject the entire move. `allow_copy=true` permits per-tensor CPU allocation and at most 1 MiB scratch while copying payload chunks. It can therefore report mixed shared/copied bytes. These counters count logical K/V tensor bytes, not physical allocation residency or padding.

## Token state, outputs and MTP

Cell positions, sequence membership, extension token/spatial metadata, stream mappings and heads move with KV. Caller token history and sampler state remain caller-owned. Logits, embeddings and graph output pointers do not transfer; evaluate a token on the destination before sampling or inspecting outputs.

For Gemma MTP, destroy borrower/assistant contexts before moving the target. Create a new CPU assistant with `ctx_other=dst` afterward. This ensures it binds to destination tensors/cells rather than old GPU graph pointers. The API rejects a target with live borrower contexts. It does not move an assistant's inference/output state. The diagnostic executable defaults to target-only greedy decoding; `--mtp` enables the post-handoff CPU assistant loop. It reconstructs assistant hidden state from the re-evaluated target token, verifies drafts with target logits and trims rejected tails. This path is limited to the one-sequence Gemma shared-KV assistant contract; it is not a general recurrent-draft state migration.

## Qualification

Use `test-kv-handoff`, `test-context-handoff` and `test-context-handoff-gemma` for CPU transaction and continuation gates. Tests cover plain/ISWA metadata/payload, retained synthetic aliases, copy fallback, cancellation, uncommitted transaction destruction, borrowed caches, invalid layouts, occupied destination, independent sequences and source destruction. Synthetic model fixtures must initialise optional RoPE factors to nonzero values.

A manual Vulkan mode of `test-context-handoff --gemma BACKEND_LIBRARY TEMP_GGUF` creates a tiny synthetic GGUF, loads CPU/Vulkan copies and compares the CPU continuation after zero-copy handoff with a same-state copied reference. The temporary model file is a test fixture; no KV state file is used by the handoff. Do not run this mode without GPU/resource coordination. Exact same-backend logits in this fixture are a correctness check, not a general cross-backend token-equality gate.

## Measured results

See [the dated implementation and performance evidence](../benchmarks/intel-1340p/xe-in-memory-20260913/README.md) for exact workload, source/runtime identities, individual runs, failures and limits.

- Trained E4B handoff shared 19,922,944 KV bytes with zero payload copies. Target-only output was `Hello.`; corrected MTP3 produced the counting sequence up to a 16-token cap, with 12 drafted / 10 accepted tokens and zero swap.
- Eight matched O3 runs used 309 prompt tokens, 128 output tokens, MTP3 and 38 MiB KV. Median handoff was 61.47 ms shared versus 82.02 ms copied; post-first-token generation was 22.48 versus 20.49 tok/s. Decode ranges overlapped, so the observed 9.7% median gain is workload-specific. Process-to-first-token stayed near 6.9 s.
- The copied control used the same GPU prefill and source allocation, bypassing only CPU-view acquisition during transfer. It was not the historical file-based route.
- Creating a sharing assistant previously reset populated target cells. The constructor now preserves and validates existing shared cells; the failed whitespace-only MTP result and corrected run are both retained.

The feature is experimental and opt-in. Public context-parameter additions require consumers to rebuild against the updated header. Long-context capacity, broad quality, a clean all-shaders release build and production serving are unqualified. No default allocator/scheduler placement or deployed service is changed.
