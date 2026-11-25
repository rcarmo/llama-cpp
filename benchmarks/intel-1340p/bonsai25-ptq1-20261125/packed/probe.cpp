// Fixed-work synthetic PTQ1 prefill screen for the two full-size FFN geometries.
#include "ggml.h"
#include "ggml-alloc.h"
#include "ggml-backend.h"

#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstdint>
#include <cstring>
#include <vector>

int main(int argc, char ** argv) {
    GGML_ASSERT(argc == 2);
    const int n = std::atoi(argv[1]);
    GGML_ASSERT(n == 128 || n == 256 || n == 512);
    const auto gpu = ggml_backend_init_by_name("Vulkan0", nullptr);
    GGML_ASSERT(gpu);
    std::printf("device=%s\n", ggml_backend_dev_description(ggml_backend_get_device(gpu)));
    const bool require_f32 = std::getenv("BONSAI_PROBE_ACC_F32") != nullptr;
    bool passed = true;
    for (const auto shape : {std::array<int, 2>{5120, 17408}, std::array<int, 2>{17408, 5120}}) {
        constexpr int patterns = 17, rows_per_upload = 256;
        const int k = shape[0], m = shape[1];
        const auto type = GGML_TYPE_PTQ1_0;
        const size_t stride = ggml_row_size(type, k);
        const auto ctx = ggml_init({ggml_tensor_overhead()*12 + ggml_graph_overhead(), nullptr, true});
        auto * a = ggml_new_tensor_2d(ctx, type, k, m);
        auto * b = ggml_new_tensor_2d(ctx, GGML_TYPE_F32, k, n);
        auto * y = ggml_mul_mat(ctx, a, b);
        if (require_f32) GGML_ASSERT(ggml_prec_set_acc(y, GGML_PREC_F32));
        auto * graph = ggml_new_graph(ctx);
        ggml_build_forward_expand(graph, y);
        auto * buf = ggml_backend_alloc_ctx_tensors(ctx, gpu);
        GGML_ASSERT(buf);
        std::vector<uint8_t> packed(patterns*stride), upload(rows_per_upload*stride);
        std::vector<float> dense(k), input(k*n), out(m*n), previous;
        for (int r = 0; r < patterns; ++r) {
            for (int j = 0; j < k; ++j) dense[j] = 0.6f*std::sin(float(j%153)*0.051f) + 0.44f*std::cos(float((j*(r+3))%233)*0.033f);
            GGML_ASSERT(ggml_quantize_chunk(type, dense.data(), packed.data()+r*stride, 0, 1, k, nullptr) == stride);
        }
        for (int base = 0; base < m; base += rows_per_upload) {
            const int rows = std::min(rows_per_upload, m-base);
            for (int j = 0; j < rows; ++j) std::memcpy(upload.data()+j*stride, packed.data()+((base+j)%patterns)*stride, stride);
            ggml_backend_tensor_set(a, upload.data(), base*stride, rows*stride);
        }
        for (int row = 0; row < n; ++row) {
            for (int j = 0; j < k; ++j) input[row*k+j] = 0.36f*std::cos(float((j+row*7)%211)*0.044f) + std::sin(float(j%153)*0.051f);
        }
        ggml_backend_tensor_set(b, input.data(), 0, ggml_nbytes(b));
        GGML_ASSERT(ggml_backend_supports_op(gpu, y));
        std::array<double, 3> samples{};
        for (int r = -1; r < (int)samples.size(); ++r) {
            const auto start = std::chrono::steady_clock::now();
            GGML_ASSERT(ggml_backend_graph_compute(gpu, graph) == GGML_STATUS_SUCCESS);
            ggml_backend_synchronize(gpu);
            const auto end = std::chrono::steady_clock::now();
            ggml_backend_tensor_get(y, out.data(), 0, ggml_nbytes(y));
            if (r < 0) previous = out;
            else {
                samples[r] = std::chrono::duration<double, std::milli>(end-start).count();
                GGML_ASSERT(std::memcmp(previous.data(), out.data(), ggml_nbytes(y)) == 0);
            }
        }
        double err2 = 0, norm2 = 0;
        for (int r = 0; r < patterns; ++r) {
            ggml_get_type_traits(type)->to_float(packed.data()+r*stride, dense.data(), k);
            for (int col = 0; col < n; ++col) {
                double ref = 0;
                for (int j = 0; j < k; ++j) ref += double(dense[j])*input[col*k+j];
                for (int i = r; i < m; i += patterns) {
                    const double error = out[col*m+i]-ref;
                    err2 += error*error;
                    norm2 += ref*ref;
                }
            }
        }
        const double nmse = err2/norm2;
        uint64_t hash = UINT64_C(1469598103934665603);
        for (const float v : out) {
            uint32_t bits; std::memcpy(&bits, &v, sizeof(bits));
            hash ^= bits; hash *= UINT64_C(1099511628211);
        }
        std::printf("OUTPUT_HASH m=%d n=%d k=%d hash=%016llx\n", m, n, k, (unsigned long long)hash);
        const bool ok = std::isfinite(nmse) && nmse <= 5e-4;
        std::printf("PREFILL m=%d n=%d k=%d acc=%s samples_ms=%.3f,%.3f,%.3f nmse=%.9g repeat=exact parity=%s\n",
                    m, n, k, require_f32 ? "f32" : "default", samples[0], samples[1], samples[2], nmse, ok ? "pass" : "fail");
        passed &= ok;
        ggml_backend_buffer_free(buf);
        ggml_free(ctx);
    }
    ggml_backend_free(gpu);
    if (!passed) return 1;
    std::puts("PASS fixed-work PTQ1 prefill");
}
