#include "ggml.h"
#include "ggml-backend.h"
#include "ggml-cpu.h"
#include "../ggml/src/ggml-cpu/spacemit/ime.h"
#include "../ggml/src/ggml-quants.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <random>
#include <vector>

static void fill_deterministic(std::vector<float> & v, uint32_t seed, float scale) {
    std::mt19937 rng(seed);
    std::uniform_real_distribution<float> dist(-scale, scale);
    for (float & x : v) {
        x = dist(rng);
    }
}

static bool run_case(ggml_type type, int64_t tokens, int n_threads) {
    constexpr int64_t k = 512;
    constexpr int64_t rows = 64;
    constexpr int64_t n_experts = 2;
    constexpr int64_t n_used = 2;

    std::vector<float> weights((size_t) n_experts * rows * k);
    std::vector<float> activations((size_t) tokens * n_used * k);
    fill_deterministic(weights, 0x1a000000u + (uint32_t) type + (uint32_t) tokens, 1.25f);
    fill_deterministic(activations, 0x1b000000u + (uint32_t) type + (uint32_t) tokens, 0.75f);

    const size_t expert_bytes = ggml_row_size(type, k) * rows;
    std::vector<uint8_t> qweights((size_t) n_experts * expert_bytes);
    std::vector<float> imatrix((size_t) rows * k, 1.0f);
    for (int64_t e = 0; e < n_experts; ++e) {
        const float * importance = ggml_quantize_requires_imatrix(type) ? imatrix.data() : nullptr;
        const size_t written = ggml_quantize_chunk(type, weights.data() + (size_t) e * rows * k,
                qweights.data() + (size_t) e * expert_bytes, 0, rows, k, importance);
        if (written != expert_bytes) {
            std::fprintf(stderr, "quantize size mismatch type=%s got=%zu expected=%zu\n", ggml_type_name(type), written,
                    expert_bytes);
            return false;
        }
    }

    const ggml_type_traits * traits = ggml_get_type_traits(type);
    if (traits == nullptr || traits->to_float == nullptr) {
        std::fprintf(stderr, "missing to_float for %s\n", ggml_type_name(type));
        return false;
    }
    std::vector<float> deq((size_t) n_experts * rows * k);
    for (int64_t e = 0; e < n_experts; ++e) {
        for (int64_t r = 0; r < rows; ++r) {
            traits->to_float(qweights.data() + (size_t) e * expert_bytes + (size_t) r * ggml_row_size(type, k),
                    deq.data() + ((size_t) e * rows + r) * k, k);
        }
    }

    std::vector<int32_t> ids((size_t) tokens * n_used);
    for (int64_t t = 0; t < tokens; ++t) {
        ids[(size_t) t * n_used + 0] = (int32_t) (t & 1);
        ids[(size_t) t * n_used + 1] = (int32_t) ((t + 1) & 1);
    }

    std::vector<float> ref((size_t) tokens * n_used * rows, 0.0f);
    for (int64_t t = 0; t < tokens; ++t) {
        for (int64_t s = 0; s < n_used; ++s) {
            const int64_t e = ids[(size_t) t * n_used + s];
            const float * a = activations.data() + ((size_t) t * n_used + s) * k;
            for (int64_t r = 0; r < rows; ++r) {
                const float * w = deq.data() + ((size_t) e * rows + r) * k;
                double acc = 0.0;
                for (int64_t kk = 0; kk < k; ++kk) {
                    acc += (double) w[kk] * a[kk];
                }
                ref[((size_t) t * n_used + s) * rows + r] = (float) acc;
            }
        }
    }

    ggml_backend_t backend = ggml_backend_cpu_init();
    if (!backend) {
        return false;
    }
    ggml_backend_cpu_set_n_threads(backend, n_threads);

    constexpr size_t graph_nodes = 16;
    ggml_init_params params = {
        /* .mem_size   = */ ggml_tensor_overhead() * 12 + ggml_graph_overhead_custom(graph_nodes, false),
        /* .mem_buffer = */ nullptr,
        /* .no_alloc   = */ true,
    };
    ggml_context * ctx = ggml_init(params);
    if (!ctx) {
        ggml_backend_free(backend);
        return false;
    }

    ggml_tensor * as = ggml_new_tensor_3d(ctx, type, k, rows, n_experts);
    ggml_set_name(as, "blk.0.ffn_gate_exps.weight");
    ggml_tensor * b = ggml_new_tensor_3d(ctx, GGML_TYPE_F32, k, n_used, tokens);
    ggml_set_name(b, "activation");
    ggml_tensor * id = ggml_new_tensor_2d(ctx, GGML_TYPE_I32, n_used, tokens);
    ggml_set_name(id, "ids");
    ggml_tensor * out = ggml_mul_mat_id(ctx, as, b, id);
    ggml_set_name(out, "out");

    ggml_backend_buffer_type_t spacemit_buft = ggml_backend_cpu_riscv64_spacemit_buffer_type();
    const size_t as_alloc_size = ggml_backend_buft_get_alloc_size(spacemit_buft, as);
    ggml_backend_buffer_t buf = ggml_backend_buft_alloc_buffer(spacemit_buft, as_alloc_size);
    if (!buf || ggml_backend_tensor_alloc(buf, as, ggml_backend_buffer_get_base(buf)) != GGML_STATUS_SUCCESS) {
        std::fprintf(stderr, "SpaceMIT allocation failed for %s\n", ggml_type_name(type));
        if (buf) ggml_backend_buffer_free(buf);
        ggml_free(ctx);
        ggml_backend_free(backend);
        return false;
    }

    std::vector<uint8_t> b_storage(ggml_nbytes(b));
    std::vector<uint8_t> id_storage(ggml_nbytes(id));
    std::vector<uint8_t> out_storage(ggml_nbytes(out));
    b->data = b_storage.data();
    id->data = id_storage.data();
    out->data = out_storage.data();

    const int64_t set_start_us = ggml_time_us();
    ggml_backend_tensor_set(as, qweights.data(), 0, qweights.size());
    const int64_t set_us = ggml_time_us() - set_start_us;
    std::memcpy(b->data, activations.data(), activations.size() * sizeof(float));
    std::memcpy(id->data, ids.data(), ids.size() * sizeof(int32_t));
    std::memset(out->data, 0, ggml_nbytes(out));

    const bool supported = ggml_backend_supports_op(backend, out);
    // Compact IQ traits are selected from the MUL_MAT_ID operation and type at
    // compute time; unlike persistent repacks, tensor->extra may remain null.
    if (!supported) {
        std::fprintf(stderr, "SpaceMIT compact path not supported type=%s extra=%p alloc=%zu plain=%zu\n",
                ggml_type_name(type), as->extra, as_alloc_size, ggml_nbytes(as));
        ggml_backend_buffer_free(buf);
        ggml_free(ctx);
        ggml_backend_free(backend);
        return false;
    }

    ggml_cgraph * gf = ggml_new_graph_custom(ctx, graph_nodes, false);
    ggml_build_forward_expand(gf, out);
    const ggml_status status = ggml_backend_graph_compute(backend, gf);
    bool ok = status == GGML_STATUS_SUCCESS;

    int bench_iters = 0;
    if (const char * v = std::getenv("SPACEMIT_IQ_MOE_BENCH_ITERS")) {
        bench_iters = std::max(0, std::atoi(v));
    }
    int64_t compute_us = 0;
    if (ok && bench_iters > 0) {
        const int64_t compute_start_us = ggml_time_us();
        for (int i = 0; i < bench_iters; ++i) {
            if (ggml_backend_graph_compute(backend, gf) != GGML_STATUS_SUCCESS) {
                ok = false;
                break;
            }
        }
        compute_us = ggml_time_us() - compute_start_us;
    }

    const float * got = (const float *) out->data;
    const size_t nout = (size_t) rows * n_used * tokens;
    double mse = 0.0;
    double ref_energy = 0.0;
    double max_abs = 0.0;
    size_t bad = 0;
    for (size_t i = 0; i < nout; ++i) {
        const double diff = (double) got[i] - ref[i];
        const double ad = std::fabs(diff);
        mse += diff * diff;
        ref_energy += (double) ref[i] * ref[i];
        max_abs = std::max(max_abs, ad);
        if (!std::isfinite(got[i]) || ad > 4.0 + 0.30 * std::fabs((double) ref[i])) {
            ++bad;
        }
    }
    const double nmse = mse / std::max(1e-12, ref_energy);
    std::printf("case type=%s tokens=%lld threads=%d mode=%s plain_bytes=%zu alloc_bytes=%zu "
                "set_us=%lld compute_us=%.3f bench_iters=%d max_abs=%.9g nmse=%.9g bad=%zu/%zu\n",
            ggml_type_name(type), (long long) tokens, n_threads,
            std::getenv("GGML_RISCV64_SPACEMIT_IQ_IME2_TILE") ? std::getenv("GGML_RISCV64_SPACEMIT_IQ_IME2_TILE") : "rvv",
            ggml_nbytes(as), as_alloc_size, (long long) set_us,
            bench_iters > 0 ? (double) compute_us / bench_iters : 0.0, bench_iters, max_abs, nmse, bad, nout);
    ok = ok && bad == 0 && nmse < 3.0e-2;

    ggml_backend_buffer_free(buf);
    ggml_free(ctx);
    ggml_backend_free(backend);
    return ok;
}

int main(int argc, char ** argv) {
    ggml_time_init();
    int n_threads = argc > 1 ? std::max(1, std::atoi(argv[1])) : 8;
    bool ok = true;
    for (ggml_type type : { GGML_TYPE_IQ2_XS, GGML_TYPE_IQ3_XXS, GGML_TYPE_IQ4_XS, GGML_TYPE_IQ4_NL }) {
        for (int64_t tokens : { 1, 4, 5 }) {
            ok = run_case(type, tokens, n_threads) && ok;
        }
    }
    ggml_quantize_free();
    return ok ? 0 : 1;
}
