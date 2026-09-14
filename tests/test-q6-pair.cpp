#include "ggml.h"
#include "ggml-backend.h"
#include "ggml-cpu.h"
#include "ggml-quants.h"

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>

static void run_case(ggml_backend_t cpu, int m, int n, int mode, std::vector<float> & all) {
    const int k = 256;
    const int batch = mode == 4 ? 2 : 1;
    const int weight_batch = mode == 4 ? 1 : batch;
    const ggml_type type = mode == 6 ? GGML_TYPE_Q5_0 : GGML_TYPE_Q6_K;
    ggml_context * ctx = ggml_init({ 4 * 1024 * 1024, nullptr, true });
    GGML_ASSERT(ctx);
    auto * x_base = ggml_new_tensor_3d(ctx, type, mode == 3 ? k + 256 : k, m, weight_batch);
    auto * x = mode == 3 ? ggml_view_3d(ctx, x_base, k, m, weight_batch, x_base->nb[1], x_base->nb[2], 0) : x_base;
    const ggml_type y_type = mode == 2 ? GGML_TYPE_Q8_K : GGML_TYPE_F32;
    auto * y_base = ggml_new_tensor_3d(ctx, y_type, mode == 1 ? k * 2 : k, n, batch);
    auto * y = mode == 1 ? ggml_view_3d(ctx, y_base, k, n, batch, y_base->nb[1], y_base->nb[2], 0) : y_base;
    auto * z = ggml_mul_mat(ctx, x, y);
    if (mode == 5) {
        ggml_mul_mat_set_prec(z, GGML_PREC_F32);
    }
    auto * graph = ggml_new_graph(ctx);
    ggml_build_forward_expand(graph, z);
    auto * buffer = ggml_backend_alloc_ctx_tensors(ctx, cpu);
    GGML_ASSERT(buffer);
    std::vector<float> xf(ggml_nelements(x_base));
    std::vector<float> yf(ggml_nelements(y_base));
    for (size_t i = 0; i < xf.size(); ++i) xf[i] = std::sin(i * 0.071) * 0.3f;
    for (size_t i = 0; i < yf.size(); ++i) yf[i] = std::cos(i * 0.013) * 0.5f;
    std::vector<uint8_t> qx(ggml_nbytes(x_base));
    if (type == GGML_TYPE_Q6_K) quantize_row_q6_K_ref(xf.data(), (block_q6_K *) qx.data(), xf.size());
    else quantize_row_q5_0_ref(xf.data(), (block_q5_0 *) qx.data(), xf.size());
    ggml_backend_tensor_set(x_base, qx.data(), 0, qx.size());
    if (y_type == GGML_TYPE_F32) {
        ggml_backend_tensor_set(y_base, yf.data(), 0, yf.size() * sizeof(float));
    } else {
        std::vector<uint8_t> qy(ggml_nbytes(y_base));
        quantize_row_q8_K_ref(yf.data(), (block_q8_K *) qy.data(), yf.size());
        ggml_backend_tensor_set(y_base, qy.data(), 0, qy.size());
    }
    GGML_ASSERT(ggml_backend_graph_compute(cpu, graph) == GGML_STATUS_SUCCESS);
    std::vector<float> result(ggml_nelements(z));
    ggml_backend_tensor_get(z, result.data(), 0, result.size() * sizeof(float));
    for (auto v : result) GGML_ASSERT(std::isfinite(v));
    all.insert(all.end(), result.begin(), result.end());
    std::fprintf(stderr, "PASS finite m=%d n=%d mode=%d\n", m, n, mode);
    ggml_backend_buffer_free(buffer);
    ggml_free(ctx);
}

int main(int argc, char ** argv) {
    const char * mode = argc > 1 ? argv[1] : "off";
    GGML_ASSERT(std::strcmp(mode, "off") == 0 || std::strcmp(mode, "on") == 0);
#if defined(_WIN32)
    _putenv_s("GGML_CPU_Q6_PAIR", std::strcmp(mode, "on") == 0 ? "1" : "0");
#else
    setenv("GGML_CPU_Q6_PAIR", std::strcmp(mode, "on") == 0 ? "1" : "0", 1);
#endif
    auto * cpu = ggml_backend_cpu_init();
    GGML_ASSERT(cpu);
    std::vector<float> all;
    for (int threads : {1, 8}) {
        ggml_backend_cpu_set_n_threads(cpu, threads);
        for (int n : {1, 2, 3, 4, 5}) for (int m : {1, 3, 65}) run_case(cpu, m, n, 0, all);
        for (int variant = 1; variant <= 6; ++variant) run_case(cpu, 65, 4, variant, all);
    }
    if (argc > 2) {
        FILE * f = std::fopen(argv[2], "wb");
        GGML_ASSERT(f);
        GGML_ASSERT(std::fwrite(all.data(), sizeof(float), all.size(), f) == all.size());
        GGML_ASSERT(std::fclose(f) == 0);
    }
    std::fprintf(stderr, "PASS 42 Q6 graph cases values=%zu mode=%s\n", all.size(), mode);
    ggml_backend_free(cpu);
}
