#include "ggml-impl.h"
#include "fa-f16-f32-mad.h"
#include <cmath>
#include <cstdio>
#include <vector>
int main() {
#if defined(__AVX2__) && defined(__F16C__) && defined(__FMA__)
    int cases = 0;
    for (int n : {1, 7, 8, 15, 31, 256, 512}) {
        std::vector<ggml_fp16_t> x(n);
        std::vector<float> got(n + 1, 0.25f), expected(n, 0.25f);
        for (int i = 0; i < n; ++i) x[i] = GGML_FP32_TO_FP16(float(i % 17 - 8)/8);
        for (int rep = 0; rep < 128; ++rep) {
            const float w = float(rep % 7 + 1)/512;
            fa_f16_f32_mad(n, got.data(), x.data(), w);
            for (int i = 0; i < n; ++i) expected[i] = std::fma(GGML_FP16_TO_FP32(x[i]), w, expected[i]);
        }
        for (int i = 0; i < n; ++i) if (!std::isfinite(got[i]) || std::abs(got[i]-expected[i]) > 1e-5f) return 1;
        if (got[n] != 0.25f) return 2;
        ++cases;
    }
    std::printf("PASS %d fused F16-load/F32-accumulate cases, tails and sentinel intact\n", cases);
    return 0;
#else
    return 3;
#endif
}
