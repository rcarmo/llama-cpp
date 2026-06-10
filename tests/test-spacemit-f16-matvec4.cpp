#include "../ggml/src/ggml-cpu/vec.h"
#include "ggml.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <random>
#include <vector>

static ggml_fp16_t to_f16(float x) {
    return GGML_CPU_FP32_TO_FP16(x);
}

static bool run_case(int n, size_t bx, uint32_t seed) {
    if (bx < (size_t) n * sizeof(ggml_fp16_t)) {
        std::fprintf(stderr, "invalid bx=%zu n=%d\n", bx, n);
        return false;
    }

    const size_t stride_elems = bx / sizeof(ggml_fp16_t);
    std::vector<ggml_fp16_t> x(stride_elems * 8 + 32);
    std::vector<ggml_fp16_t> y((size_t) n + 32);

    std::mt19937 rng(seed);
    std::uniform_real_distribution<float> dist(-1.0f, 1.0f);
    for (ggml_fp16_t & v : x) {
        v = to_f16(dist(rng));
    }
    for (ggml_fp16_t & v : y) {
        v = to_f16(dist(rng));
    }

    float got4[4] = {0, 0, 0, 0};
    float got8[8] = {0, 0, 0, 0, 0, 0, 0, 0};
    float ref[8]  = {0, 0, 0, 0, 0, 0, 0, 0};
    ggml_vec_dot_f16_4(n, got4, x.data(), bx, y.data());
    ggml_vec_dot_f16_8(n, got8, x.data(), bx, y.data());
    for (int r = 0; r < 8; ++r) {
        ggml_vec_dot_f16(n, &ref[r], 0, x.data() + (size_t) r * stride_elems, 0, y.data(), 0, 1);
    }

    bool ok = true;
    for (int r = 0; r < 8; ++r) {
        const double got = r < 4 ? got4[r] : got8[r];
        const double diff = std::fabs(got - (double) ref[r]);
        const double tol = 2.0e-2 + 2.0e-3 * std::fabs((double) ref[r]);
        if (r < 4 && (!std::isfinite(got4[r]) || std::fabs((double) got4[r] - (double) ref[r]) > tol)) {
            std::fprintf(stderr, "bad4 n=%d bx=%zu row=%d got=% .9g ref=% .9g diff=%g tol=%g\n", n, bx, r, got4[r], ref[r], std::fabs((double) got4[r] - (double) ref[r]), tol);
            ok = false;
        }
        if (!std::isfinite(got8[r]) || std::fabs((double) got8[r] - (double) ref[r]) > tol) {
            std::fprintf(stderr, "bad8 n=%d bx=%zu row=%d got=% .9g ref=% .9g diff=%g tol=%g\n", n, bx, r, got8[r], ref[r], std::fabs((double) got8[r] - (double) ref[r]), tol);
            ok = false;
        }
        GGML_UNUSED(diff);
    }
    std::printf("case n=%d bx=%zu got4=[%.8g %.8g %.8g %.8g] got8=[%.8g %.8g %.8g %.8g %.8g %.8g %.8g %.8g] %s\n",
                n, bx, got4[0], got4[1], got4[2], got4[3], got8[0], got8[1], got8[2], got8[3], got8[4], got8[5], got8[6], got8[7], ok ? "ok" : "FAIL");
    return ok;
}

int main() {
    ggml_time_init();

    bool ok = true;
    ok = run_case(256, 256 * sizeof(ggml_fp16_t), 0x1604u) && ok; // Gemma cache_v_l attention shape
    ok = run_case(128, 128 * sizeof(ggml_fp16_t), 0x1605u) && ok;
    ok = run_case(257, 272 * sizeof(ggml_fp16_t), 0x1606u) && ok; // tail + padded stride
    ok = run_case(511, 512 * sizeof(ggml_fp16_t), 0x1607u) && ok;

    return ok ? 0 : 1;
}
