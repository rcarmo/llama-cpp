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

static bool run_case(int64_t rows, int64_t tokens, int64_t k, int n_threads) {
    if (k % QK_K != 0 || rows % 32 != 0) {
        std::fprintf(stderr, "invalid case rows=%lld tokens=%lld k=%lld\n", (long long) rows, (long long) tokens,
                     (long long) k);
        return false;
    }

    std::vector<float> weights((size_t) rows * (size_t) k);
    std::vector<float> activations((size_t) tokens * (size_t) k);
    fill_deterministic(weights, 0x4a34u + (uint32_t) rows + (uint32_t) k, 1.75f);
    fill_deterministic(activations, 0x9e27u + (uint32_t) tokens + (uint32_t) k, 0.80f);

    const size_t qbytes = ggml_row_size(GGML_TYPE_Q4_K, k) * (size_t) rows;
    std::vector<uint8_t> qweights(qbytes);
    const int64_t n_blocks = ((int64_t) weights.size()) / QK_K;
    ggml_quantize_chunk(GGML_TYPE_Q4_K, weights.data(), qweights.data(), 0, n_blocks, QK_K, nullptr);

    std::vector<float> deq((size_t) rows * (size_t) k);
    dequantize_row_q4_K((const block_q4_K *) qweights.data(), deq.data(), (int64_t) deq.size());

    std::vector<float> ref((size_t) rows * (size_t) tokens, 0.0f);
    for (int64_t r = 0; r < rows; ++r) {
        for (int64_t t = 0; t < tokens; ++t) {
            double acc = 0.0;
            for (int64_t kk = 0; kk < k; ++kk) {
                acc += (double) deq[(size_t) r * (size_t) k + (size_t) kk] *
                       (double) activations[(size_t) t * (size_t) k + (size_t) kk];
            }
            ref[(size_t) t * (size_t) rows + (size_t) r] = (float) acc;
        }
    }

    ggml_backend_t backend = ggml_backend_cpu_init();
    if (!backend) {
        std::fprintf(stderr, "ggml_backend_cpu_init failed\n");
        return false;
    }
    ggml_backend_cpu_set_n_threads(backend, n_threads);

    const size_t graph_nodes = 16;
    ggml_init_params params = {
        /* .mem_size   = */ ggml_tensor_overhead() * 8 + ggml_graph_overhead_custom(graph_nodes, false),
        /* .mem_buffer = */ nullptr,
        /* .no_alloc   = */ true,
    };
    ggml_context * ctx = ggml_init(params);
    if (!ctx) {
        std::fprintf(stderr, "ggml_init failed\n");
        ggml_backend_free(backend);
        return false;
    }

    ggml_tensor * a = ggml_new_tensor_2d(ctx, GGML_TYPE_Q4_K, k, rows);
    ggml_set_name(a, "q4k_weight");
    ggml_tensor * b = ggml_new_tensor_2d(ctx, GGML_TYPE_F32, k, tokens);
    ggml_set_name(b, "activation");
    ggml_tensor * out = ggml_mul_mat(ctx, a, b);
    ggml_set_name(out, "out");

    ggml_backend_buffer_type_t spacemit_buft = ggml_backend_cpu_riscv64_spacemit_buffer_type();
    const size_t               a_alloc_size  = ggml_backend_buft_get_alloc_size(spacemit_buft, a);
    ggml_backend_buffer_t      buf           = ggml_backend_buft_alloc_buffer(spacemit_buft, a_alloc_size);
    if (!buf) {
        std::fprintf(stderr, "ggml_backend_buft_alloc_buffer failed\n");
        ggml_free(ctx);
        ggml_backend_free(backend);
        return false;
    }
    if (ggml_backend_tensor_alloc(buf, a, ggml_backend_buffer_get_base(buf)) != GGML_STATUS_SUCCESS) {
        std::fprintf(stderr, "ggml_backend_tensor_alloc failed for Q4_K weight\n");
        ggml_backend_buffer_free(buf);
        ggml_free(ctx);
        ggml_backend_free(backend);
        return false;
    }

    std::vector<uint8_t> b_storage(ggml_nbytes(b));
    std::vector<uint8_t> out_storage(ggml_nbytes(out));
    b->data   = b_storage.data();
    out->data = out_storage.data();

    // SpaceMIT's backend buffer set_tensor() repacks tensors with SpaceMIT traits.  Keep F32 activation/output host-side,
    // matching the backend support contract for MUL_MAT.
    ggml_backend_tensor_set(a, qweights.data(), 0, qweights.size());
    std::memcpy(b->data, activations.data(), activations.size() * sizeof(float));
    std::memset(out->data, 0, ggml_nbytes(out));

    const bool supports_op = ggml_backend_supports_op(backend, out);
    if (!supports_op || a->extra == nullptr) {
        std::fprintf(stderr, "case rows=%lld tokens=%lld k=%lld did not select SpaceMIT Q4_K path: supports=%d a_extra=%p\n",
                     (long long) rows, (long long) tokens, (long long) k, supports_op ? 1 : 0, a->extra);
        ggml_backend_buffer_free(buf);
        ggml_free(ctx);
        ggml_backend_free(backend);
        return false;
    }

    if (std::getenv("SPACEMIT_Q4K_CORRECTNESS_VERBOSE")) {
        std::fprintf(stderr,
                     "diag rows=%lld tokens=%lld k=%lld backend=%s a_extra=%p b_extra=%p out_extra=%p a_buft=%s b_buffer=%p out_buffer=%p a_data=%p b_data=%p out_data=%p a_nbytes=%zu a_alloc=%zu b_nbytes=%zu out_nbytes=%zu b_first=% .8f\n",
                     (long long) rows, (long long) tokens, (long long) k, ggml_backend_name(backend), a->extra,
                     b->extra, out->extra, "CPU_RISCV64_SPACEMIT", (void *) b->buffer, (void *) out->buffer,
                     a->data, b->data, out->data, ggml_nbytes(a), a_alloc_size, ggml_nbytes(b), ggml_nbytes(out),
                     b->data ? ((float *) b->data)[0] : 0.0f);
    }

    ggml_cgraph * gf = ggml_new_graph_custom(ctx, graph_nodes, false);
    ggml_build_forward_expand(gf, out);

    ggml_status status = ggml_backend_graph_compute(backend, gf);
    bool ok = status == GGML_STATUS_SUCCESS;
    if (!ok) {
        std::fprintf(stderr, "ggml_backend_graph_compute failed: %s\n", ggml_status_to_string(status));
    }

    const float * got = (const float *) out->data;
    double max_abs    = 0.0;
    double max_rel    = 0.0;
    double mse        = 0.0;
    double ref_energy = 0.0;
    double got_energy = 0.0;
    size_t bad = 0;
    const size_t nout = (size_t) rows * (size_t) tokens;
    for (size_t i = 0; i < nout; ++i) {
        const double diff = (double) got[i] - (double) ref[i];
        const double ad = std::fabs(diff);
        const double rel = ad / std::max(1e-6, std::fabs((double) ref[i]));
        max_abs = std::max(max_abs, ad);
        max_rel = std::max(max_rel, rel);
        mse += diff * diff;
        ref_energy += (double) ref[i] * (double) ref[i];
        got_energy += (double) got[i] * (double) got[i];
        if (!std::isfinite(got[i]) || ad > 4.0 + 0.25 * std::fabs((double) ref[i])) {
            if (bad < 12) {
                std::fprintf(stderr, "bad[%zu] got=% .8f ref=% .8f diff=% .8f rel=% .8f\n", i, got[i], ref[i],
                             (float) diff, (float) rel);
            }
            ++bad;
        }
    }
    mse /= std::max<size_t>(1, nout);
    ref_energy /= std::max<size_t>(1, nout);
    got_energy /= std::max<size_t>(1, nout);
    const double ref_rms = std::sqrt(ref_energy);
    const double got_rms = std::sqrt(got_energy);
    const double rmse    = std::sqrt(mse);
    const double nmse    = mse / std::max(1e-12, ref_energy);

    std::printf("case rows=%lld tokens=%lld k=%lld threads=%d max_abs=%.9g max_rel=%.9g rmse=%.9g ref_rms=%.9g got_rms=%.9g nmse=%.9g bad=%zu/%zu\n",
                (long long) rows, (long long) tokens, (long long) k, n_threads, max_abs, max_rel, rmse, ref_rms,
                got_rms, nmse, bad, nout);

    ok = ok && bad == 0 && nmse < 2.0e-2 && got_rms > 0.01 * ref_rms;

    ggml_backend_buffer_free(buf);
    ggml_free(ctx);
    ggml_backend_free(backend);
    return ok;
}

int main(int argc, char ** argv) {
    ggml_time_init();

    int n_threads = 8;
    if (argc > 1) {
        n_threads = std::atoi(argv[1]);
        if (n_threads <= 0) {
            n_threads = 1;
        }
    }

    bool ok = true;
    // Cover m1, m4, mixed m4+m1 tails, and a prompt-sized activation row set.
    for (int64_t tokens = 1; tokens <= 9; ++tokens) {
        ok = run_case(64, tokens, 512, n_threads) && ok;
    }
    ok = run_case(64, 32, 512, n_threads) && ok;
    ok = run_case(32, 1, 256, n_threads) && ok;
    ok = run_case(128, 1, 1024, n_threads) && ok;

    ggml_quantize_free();
    return ok ? 0 : 1;
}
