## CUDA graph executable allocation recovery

Repeated agentic requests can need new CUDA executable graphs after model and
compute buffers have already filled most VRAM. Previously, an allocation error
from graph instantiation aborted the process. The backend now falls back to
eager execution for that graph key when executable creation or update returns
`cudaErrorMemoryAllocation`.

Capture records operations but does not execute them. Recovery is confined to
the interval after capture ends and before graph launch: clear the allocation
error, synchronise the stream, destroy the executable and captured graph, mark
the entry disabled, and evaluate the original graph eagerly. The existing
capture lock has already been released. Launch and kernel errors are not
retried because their operations may already have modified recurrent state.

The update helper now returns its status rather than aborting on allocation
failure. An incompatible executable is still destroyed and recreated, but that
recreation can also take the allocation fallback. Freshly instantiated graphs
are no longer redundantly updated immediately afterward.

The disable flag belongs to the graph-cache entry. Existing idle eviction can
remove it; a newly created entry can try graph mode again. This is not a global
executable-cache byte budget and does not recover model, KV or eager-kernel OOM.

## Testing

`tests/cuda-graph-fault.cpp` is a CUDA 12, Linux-only LD_PRELOAD test shim, not
part of the production build. Build separately:

```bash
g++ -shared -fPIC -I/usr/local/cuda-12.8/include \
  tests/cuda-graph-fault.cpp -ldl -o /tmp/cuda-graph-fault.so
GRAPH_FAULT=instantiate LD_PRELOAD=/tmp/cuda-graph-fault.so \
  build-cuda/bin/llama-server ...
# Or GRAPH_FAULT=update to exercise update-allocation recovery.
```

Use the candidate library directory first in LD_LIBRARY_PATH. A production
launcher can override it and silently load the old library; this happened in
the first test, correctly reproducing the old fatal behaviour rather than
testing the fix.

On Qwen3.6 35B-A3B native MTP, two repeated 128-token requests were tested in
eager, normal, forced-instantiation-failure and forced-update-failure modes.
All eight raw token sequences matched exactly. Each forced mode emitted six
injection messages and six eager-fallback warnings. Throughput was affected by
host contention and is not used to claim a speed improvement.

Four repeated three-turn agentic tasks also passed with the formerly failing
24-cache-slot, 1024-microbatch configuration. No actual allocation failure
occurred in that run, so it proves ordinary-path stability, not natural OOM
recovery. Fault injection establishes recovery-path execution. Production
should retain its measured 16-slot headroom profile rather than depend on
falling back when resources run out.
