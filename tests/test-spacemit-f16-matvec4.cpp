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
    std::vector<ggml_fp16_t> x(stride_elems * 4 + 32);
    std::vector<ggml_fp16_t> y((size_t) n + 32);

    std::mt19937 rng(seed);
    std::uniform_real_distribution<float> dist(-1.0f, 1.0f);
    for (ggml_fp16_t & v : x) {
        v = to_f16(dist(rng));
    }
    for (ggml_fp16_t & v : y) {
        v = to_f16(dist(rng));
    }

    float got[4] = {0, 0, 0, 0};
    float ref[4] = {0, 0, 0, 0};
    ggml_vec_dot_f16_4(n, got, x.data(), bx, y.data());
    for (int r = 0; r < 4; ++r) {
        ggml_vec_dot_f16(n, &ref[r], 0, x.data() + (size_t) r * stride_elems, 0, y.data(), 0, 1);
    }

    bool ok = true;
    for (int r = 0; r < 4; ++r) {
        const double diff = std::fabs((double) got[r] - (double) ref[r]);
        const double tol = 2.0e-2 + 2.0e-3 * std::fabs((double) ref[r]);
        if (!std::isfinite(got[r]) || diff > tol) {
            std::fprintf(stderr, "bad n=%d bx=%zu row=%d got=% .9g ref=% .9g diff=%g tol=%g\n", n, bx, r, got[r], ref[r], diff, tol);
            ok = false;
        }
    }
    std::printf("case n=%d bx=%zu got=[%.8g %.8g %.8g %.8g] ref=[%.8g %.8g %.8g %.8g] %s\n",
                n, bx, got[0], got[1], got[2], got[3], ref[0], ref[1], ref[2], ref[3], ok ? "ok" : "FAIL");
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
