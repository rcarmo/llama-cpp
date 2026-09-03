#include "ggml.h"
#include "ggml-backend.h"
#include "ggml-cpu.h"

#include <cassert>
#include <cmath>
#include <cstdio>
#include <vector>

static ggml_tensor * make_branch(ggml_context * ctx, ggml_tensor * input, float scale0, float scale1, const char * name) {
    ggml_tensor * a = ggml_scale(ctx, input, scale0);
    ggml_tensor * b = ggml_sqr(ctx, a);
    ggml_tensor * c = ggml_scale(ctx, b, scale1);
    ggml_tensor * d = ggml_add(ctx, c, input);
    ggml_set_name(d, name);
    return d;
}

int main() {
    ggml_backend_t hot_backend  = ggml_backend_cpu_init();
    ggml_backend_t cold_backend = ggml_backend_cpu_init();
    GGML_ASSERT(hot_backend != nullptr && cold_backend != nullptr);

    ggml_backend_cpu_set_n_threads(hot_backend, 2);
    ggml_backend_cpu_set_n_threads(cold_backend, 2);

    ggml_backend_t backends[] = { hot_backend, cold_backend };
    ggml_backend_sched_t sched = ggml_backend_sched_new(backends, nullptr, 2, 64, false, true);
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

    ggml_tensor * cold = make_branch(ctx, cold_input, 2.0f, 0.5f, "ffn_moe_down_cold-0");
    ggml_tensor * hot  = make_branch(ctx, hot_input,  3.0f, 0.25f, "ffn_moe_down_hot-0");
    ggml_tensor * out  = ggml_add(ctx, cold, hot);
    ggml_set_output(out);

    ggml_cgraph * graph = ggml_new_graph(ctx);
    ggml_build_forward_expand(graph, out);

    ggml_backend_sched_set_tensor_backend(sched, cold_input, cold_backend);
    ggml_backend_sched_set_tensor_backend(sched, hot_input,  hot_backend);
    for (int i = 0; i < ggml_graph_n_nodes(graph); ++i) {
        ggml_tensor * node = ggml_graph_node(graph, i);
        if (node == out) {
            ggml_backend_sched_set_tensor_backend(sched, node, cold_backend);
        } else if (node == hot || node->src[0] == hot_input || (node->src[0] && node->src[0]->src[0] == hot_input)) {
            ggml_backend_sched_set_tensor_backend(sched, node, hot_backend);
        } else {
            ggml_backend_sched_set_tensor_backend(sched, node, cold_backend);
        }
    }

    GGML_ASSERT(ggml_backend_sched_alloc_graph(sched, graph));

    std::vector<float> cold_data(n), hot_data(n), output(n);
    for (int64_t i = 0; i < n; ++i) {
        cold_data[i] = float((i % 17) - 8) / 8.0f;
        hot_data[i]  = float((i % 13) - 6) / 6.0f;
    }
    ggml_backend_tensor_set(cold_input, cold_data.data(), 0, cold_data.size() * sizeof(float));
    ggml_backend_tensor_set(hot_input,  hot_data.data(),  0, hot_data.size()  * sizeof(float));

    for (bool enabled : { false, true, true, false, true }) {
        ggml_backend_sched_set_async_cpu(sched, enabled);
        for (int repeat = 0; repeat < 3; ++repeat) {
            // Scheduler graph inputs are application-owned and refreshed for
            // every evaluation, matching llama_context graph execution.
            ggml_backend_tensor_set(cold_input, cold_data.data(), 0, cold_data.size() * sizeof(float));
            ggml_backend_tensor_set(hot_input,  hot_data.data(),  0, hot_data.size()  * sizeof(float));
            const ggml_status status = ggml_backend_sched_graph_compute(sched, graph);
            GGML_ASSERT(status == GGML_STATUS_SUCCESS);
            ggml_backend_tensor_get(out, output.data(), 0, output.size() * sizeof(float));
            for (int64_t i = 0; i < n; ++i) {
                const float expected = 2.0f * cold_data[i] * cold_data[i] + cold_data[i]
                                     + 2.25f * hot_data[i] * hot_data[i] + hot_data[i];
                if (std::fabs(output[i] - expected) >= 1e-5f) {
                    std::fprintf(stderr, "mismatch enabled=%d repeat=%d i=%lld got=%g expected=%g\n",
                            enabled ? 1 : 0, repeat, (long long) i, output[i], expected);
                    GGML_ABORT("scheduler output mismatch");
                }
            }
        }
        ggml_backend_sched_synchronize(sched);
    }

    ggml_backend_sched_free(sched);
    ggml_free(ctx);
    ggml_backend_free(hot_backend);
    ggml_backend_free(cold_backend);

    std::puts("async CPU scheduler test passed");
    return 0;
}
