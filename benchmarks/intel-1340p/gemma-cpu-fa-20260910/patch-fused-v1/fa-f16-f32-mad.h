#pragma once
#include "ggml.h"
#if defined(__AVX2__) && defined(__F16C__) && defined(__FMA__)
#include <immintrin.h>
static inline void fa_f16_f32_mad(int n, float * y, const ggml_fp16_t * x, float weight) {
    const __m256 w = _mm256_set1_ps(weight);
    int i = 0;
    for (; i + 8 <= n; i += 8) {
        const __m128i h = _mm_loadu_si128((const __m128i *)(x + i));
        const __m256 v = _mm256_cvtph_ps(h);
        const __m256 a = _mm256_loadu_ps(y + i);
        _mm256_storeu_ps(y + i, _mm256_fmadd_ps(v, w, a));
    }
    for (; i < n; ++i) y[i] += GGML_FP16_TO_FP32(x[i]) * weight;
}
#endif
