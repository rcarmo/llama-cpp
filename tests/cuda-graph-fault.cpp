// CUDA 12 test-only LD_PRELOAD shim. Never link into a production binary.
// GRAPH_FAULT=instantiate or update injects pre-launch allocation failure.
#include <cuda_runtime_api.h>
#include <cstdlib>
#include <cstdio>
#include <cstring>
#include <dlfcn.h>

extern "C" cudaError_t cudaGraphInstantiate(cudaGraphExec_t * exec, cudaGraph_t graph,
        unsigned long long flags) {
    const char * mode = std::getenv("GRAPH_FAULT");
    if (mode && std::strcmp(mode, "instantiate") == 0) {
        *exec = nullptr;
        std::fprintf(stderr, "TEST injected cudaGraphInstantiate allocation failure\n");
        return cudaErrorMemoryAllocation;
    }
    using fn = cudaError_t (*)(cudaGraphExec_t *, cudaGraph_t, unsigned long long);
    auto real = reinterpret_cast<fn>(dlsym(RTLD_NEXT, "cudaGraphInstantiate"));
    if (!real) std::abort();
    return real(exec, graph, flags);
}

extern "C" cudaError_t cudaGraphExecUpdate(cudaGraphExec_t exec, cudaGraph_t graph,
        cudaGraphExecUpdateResultInfo * info) {
    const char * mode = std::getenv("GRAPH_FAULT");
    if (mode && std::strcmp(mode, "update") == 0) {
        std::fprintf(stderr, "TEST injected cudaGraphExecUpdate allocation failure\n");
        return cudaErrorMemoryAllocation;
    }
    using fn = cudaError_t (*)(cudaGraphExec_t, cudaGraph_t, cudaGraphExecUpdateResultInfo *);
    auto real = reinterpret_cast<fn>(dlsym(RTLD_NEXT, "cudaGraphExecUpdate"));
    if (!real) std::abort();
    return real(exec, graph, info);
}
