#include "ggml.h"
#include "ggml-backend.h"
#include "ggml-cpu.h"
#include "../ggml/src/ggml-backend-impl.h"

#include <cassert>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <vector>
#include <atomic>
#include <chrono>
#include <thread>

static std::atomic<int> active_compute{0};
static std::atomic<bool> concurrent_compute{false};
static std::atomic<bool> inject_failure{false};
static ggml_backend_t failing_backend = nullptr;
static ggml_status (*cpu_compute)(ggml_backend_t, ggml_cgraph *) = nullptr;

static ggml_status observed_compute(ggml_backend_t backend, ggml_cgraph * graph) {
    if (active_compute.fetch_add(1) > 0) {
        concurrent_compute.store(true);
    }
    // Widen the observation window; this measures simultaneous execution, not
    // a throughput claim. No unbounded barrier can hang the serialized control.
    std::this_thread::sleep_for(std::chrono::milliseconds(5));
    const ggml_status status = backend == failing_backend && inject_failure.exchange(false)
            ? GGML_STATUS_FAILED : cpu_compute(backend, graph);
    active_compute.fetch_sub(1);
    return status;
}

static ggml_tensor * make_branch(ggml_context * ctx, ggml_tensor * input, float scale0, float scale1, const char * name) {
    ggml_tensor * a = ggml_scale(ctx, input, scale0);
    ggml_tensor * b = ggml_sqr(ctx, a);
    ggml_tensor * c = ggml_scale(ctx, b, scale1);
    ggml_tensor * d = ggml_add(ctx, c, input);
    ggml_set_name(d, name);
    return d;
}

int main(int argc, char ** argv) {
    const bool single_backend = argc > 1 && std::strcmp(argv[1], "single") == 0;
    const bool alias_write = argc > 1 && std::strcmp(argv[1], "alias") == 0;
    const bool reuse = argc > 1 && std::strcmp(argv[1], "reuse") == 0;
    const bool failure = argc > 1 && std::strcmp(argv[1], "failure") == 0;
    const bool gpu = argc > 1 && std::strcmp(argv[1], "gpu") == 0;
    ggml_backend_t hot_backend;
    if (gpu) {
        ggml_backend_load_all();
        ggml_backend_dev_t dev = ggml_backend_dev_by_type(GGML_BACKEND_DEVICE_TYPE_GPU);
        if (!dev) { std::puts("GPU unavailable: skipped"); return 77; }
        hot_backend = ggml_backend_dev_init(dev, nullptr);
    } else {
        hot_backend = ggml_backend_cpu_init();
    }
    ggml_backend_t cold_backend = ggml_backend_cpu_init();
    GGML_ASSERT(hot_backend != nullptr && cold_backend != nullptr);

    cpu_compute = cold_backend->iface.graph_compute;
    if (!gpu) {
        GGML_ASSERT(cpu_compute == hot_backend->iface.graph_compute);
        hot_backend->iface.graph_compute = observed_compute;
    }
    cold_backend->iface.graph_compute = observed_compute;

    if (!gpu) ggml_backend_cpu_set_n_threads(hot_backend, 2);
    ggml_backend_cpu_set_n_threads(cold_backend, 2);

    ggml_backend_t backends[] = { hot_backend, cold_backend };
    // Distinct buffer-type identities prevent pass 3 from coalescing both CPU
    // instances. Allocation/support behavior remains that of the CPU backend.
    ggml_backend_buffer_type cold_buft = *ggml_backend_cpu_buffer_type();
    ggml_backend_buffer_type_t bufts[] = { ggml_backend_get_default_buffer_type(hot_backend), &cold_buft };
    ggml_backend_sched_t sched = ggml_backend_sched_new(
            single_backend ? backends + 1 : backends,
            single_backend ? bufts + 1 : bufts, single_backend ? 1 : 2, 64, false, true);
    ggml_backend_t other_backend = single_backend ? cold_backend : hot_backend;
    GGML_ASSERT(sched != nullptr);

    ggml_init_params params = {
        /*.mem_size   =*/ 2 * 1024 * 1024,
        /*.mem_buffer =*/ nullptr,
        /*.no_alloc   =*/ true,
    };
    ggml_context * ctx = ggml_init(params);
    GGML_ASSERT(ctx != nullptr);

    constexpr int64_t n = 4096;
    ggml_tensor * cold_input = ggml_new_tensor_1d(ctx, GGML_TYPE_F32, n);
    ggml_tensor * hot_input  = ggml_new_tensor_1d(ctx, GGML_TYPE_F32, n);
    ggml_set_input(cold_input);
    ggml_set_input(hot_input);

    ggml_tensor * cold = make_branch(ctx, cold_input, 2.0f, 0.5f, "independent_cpu_branch");
    ggml_tensor * hot;
    if (alias_write) {
        ggml_tensor * view = ggml_view_1d(ctx, cold_input, n, 0);
        ggml_tensor * nested = ggml_view_1d(ctx, view, n, 0);
        hot = ggml_scale_inplace(ctx, nested, 3.0f);
        ggml_set_name(hot, "aliased_write");
    } else {
        hot = make_branch(ctx, hot_input, 3.0f, 0.25f, "independent_other_branch");
    }
    // A consumer through nested views must join the CPU producer, even though
    // neither view has pointer identity with the producing operation.
    ggml_tensor * cold_view = ggml_view_1d(ctx, cold, n, 0);
    ggml_tensor * cold_nested_view = ggml_view_1d(ctx, cold_view, n, 0);
    ggml_tensor * out  = ggml_add(ctx, cold_nested_view, hot);
    ggml_set_output(out);

    ggml_cgraph * graph = ggml_new_graph(ctx);
    ggml_build_forward_expand(graph, out);

    ggml_backend_sched_set_tensor_backend(sched, cold_input, cold_backend);
    ggml_backend_sched_set_tensor_backend(sched, hot_input,  other_backend);
    bool hot_chain = false;
    for (int i = 0; i < ggml_graph_n_nodes(graph); ++i) {
        ggml_tensor * node = ggml_graph_node(graph, i);
        if (node->src[0] == hot_input || node == hot) { hot_chain = true; }
        // Retain intermediates in this overlap fixture so allocator reuse does
        // not legitimately force serialization of otherwise independent work.
        if (!reuse) { ggml_set_output(node); }
        if (node == out) {
            ggml_backend_sched_set_tensor_backend(sched, node, cold_backend);
        } else if (hot_chain) {
            ggml_backend_sched_set_tensor_backend(sched, node, other_backend);
        } else {
            ggml_backend_sched_set_tensor_backend(sched, node, cold_backend);
        }
    }

    GGML_ASSERT(ggml_backend_sched_alloc_graph(sched, graph));
    GGML_ASSERT(single_backend || ggml_backend_sched_get_n_splits(sched) >= 3);

    std::vector<float> cold_data(n), hot_data(n), output(n);
    for (int64_t i = 0; i < n; ++i) {
        cold_data[i] = float((i % 17) - 8) / 8.0f;
        hot_data[i]  = float((i % 13) - 6) / 6.0f;
    }
    ggml_backend_tensor_set(cold_input, cold_data.data(), 0, cold_data.size() * sizeof(float));
    if (!alias_write) ggml_backend_tensor_set(hot_input,  hot_data.data(),  0, hot_data.size()  * sizeof(float));

    for (bool enabled : { false, true, true, false, true }) {
        concurrent_compute.store(false);
        ggml_backend_sched_set_async_cpu(sched, enabled);
        for (int repeat = 0; repeat < 3; ++repeat) {
            // Scheduler graph inputs are application-owned and refreshed for
            // every evaluation, matching llama_context graph execution.
            ggml_backend_tensor_set(cold_input, cold_data.data(), 0, cold_data.size() * sizeof(float));
            if (!alias_write) ggml_backend_tensor_set(hot_input,  hot_data.data(),  0, hot_data.size()  * sizeof(float));
            const ggml_status status = ggml_backend_sched_graph_compute(sched, graph);
            GGML_ASSERT(status == GGML_STATUS_SUCCESS);
            ggml_backend_tensor_get(out, output.data(), 0, output.size() * sizeof(float));
            for (int64_t i = 0; i < n; ++i) {
                const float expected = 2.0f * cold_data[i] * cold_data[i] + cold_data[i]
                                     + (alias_write ? 3.0f * cold_data[i]
                                                    : 2.25f * hot_data[i] * hot_data[i] + hot_data[i]);
                if (std::fabs(output[i] - expected) >= 1e-5f) {
                    std::fprintf(stderr, "mismatch enabled=%d repeat=%d i=%lld got=%g expected=%g\n",
                            enabled ? 1 : 0, repeat, (long long) i, output[i], expected);
                    GGML_ABORT("scheduler output mismatch");
                }
            }
        }
        ggml_backend_sched_synchronize(sched);
        if (!reuse && !gpu) {
            GGML_ASSERT(concurrent_compute.load() == (enabled && !single_backend && !alias_write));
        }
        GGML_ASSERT(active_compute.load() == 0);
    }

    if (failure) {
        ggml_backend_sched_set_async_cpu(sched, true);
        for (ggml_backend_t backend : { cold_backend, hot_backend }) {
            failing_backend = backend;
            inject_failure.store(true);
            GGML_ASSERT(ggml_backend_sched_graph_compute_async(sched, graph) == GGML_STATUS_FAILED);
            GGML_ASSERT(active_compute.load() == 0);
            // A failure must not poison the next evaluation.
            GGML_ASSERT(ggml_backend_sched_graph_compute(sched, graph) == GGML_STATUS_SUCCESS);
        }
        failing_backend = nullptr;
    }

    // Reset/reallocation and teardown after async submission must be safe.
    ggml_backend_sched_reset(sched);
    GGML_ASSERT(ggml_backend_sched_alloc_graph(sched, graph));
    ggml_backend_tensor_set(cold_input, cold_data.data(), 0, cold_data.size() * sizeof(float));
    if (!alias_write) ggml_backend_tensor_set(hot_input, hot_data.data(), 0, hot_data.size() * sizeof(float));
    GGML_ASSERT(ggml_backend_sched_graph_compute_async(sched, graph) == GGML_STATUS_SUCCESS);
    ggml_backend_sched_free(sched);
    GGML_ASSERT(active_compute.load() == 0);
    ggml_free(ctx);
    ggml_backend_free(hot_backend);
    ggml_backend_free(cold_backend);

    std::puts("async CPU scheduler test passed");
    return 0;
}
