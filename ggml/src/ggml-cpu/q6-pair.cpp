#include "q6-pair.h"
#include "quants.h"

#if defined(__AVX2__) && defined(__FMA__)
#include <immintrin.h>

static inline __m128i scale_shuffle(int i) {
    const char a = 2 * i, b = a + 1;
    return _mm_setr_epi8(a, a, a, a, a, a, a, a, b, b, b, b, b, b, b, b);
}

static inline float sum8(__m256 x) {
    __m128 r = _mm_add_ps(_mm256_extractf128_ps(x, 1), _mm256_castps256_ps128(x));
    r = _mm_add_ps(r, _mm_movehl_ps(r, r));
    r = _mm_add_ss(r, _mm_movehdup_ps(r));
    return _mm_cvtss_f32(r);
}

static void q6_pair_avx2(int n, float * out, size_t stride,
                         const block_q6_K * x, const block_q8_K * y0, const block_q8_K * y1) {
    GGML_ASSERT(n % QK_K == 0);
    const __m256i m3=_mm256_set1_epi8(3),m15=_mm256_set1_epi8(15);
    __m256 acc[2]={_mm256_setzero_ps(),_mm256_setzero_ps()};
    const block_q8_K *ys[2]={y0,y1};
    for(int i=0;i<n/QK_K;i++){
        const float scale=ggml_fp16_to_fp32(x[i].d);
        const __m128i scales=_mm_loadu_si128((const __m128i*)x[i].scales);
        const __m256i scales16=_mm256_cvtepi8_epi16(scales);
        __m256i sums[2]={_mm256_setzero_si256(),_mm256_setzero_si256()};
        for(int j=0;j<2;j++){
            const uint8_t *ql=x[i].ql+64*j,*qh=x[i].qh+32*j;
            const __m256i low0=_mm256_loadu_si256((const __m256i*)ql),low1=_mm256_loadu_si256((const __m256i*)(ql+32)),high=_mm256_loadu_si256((const __m256i*)qh);
            const __m256i q[4]={
                _mm256_or_si256(_mm256_and_si256(low0,m15),_mm256_slli_epi16(_mm256_and_si256(high,m3),4)),
                _mm256_or_si256(_mm256_and_si256(low1,m15),_mm256_slli_epi16(_mm256_and_si256(high,_mm256_set1_epi8(12)),2)),
                _mm256_or_si256(_mm256_and_si256(_mm256_srli_epi16(low0,4),m15),_mm256_and_si256(high,_mm256_set1_epi8(48))),
                _mm256_or_si256(_mm256_and_si256(_mm256_srli_epi16(low1,4),m15),_mm256_srli_epi16(_mm256_and_si256(high,_mm256_set1_epi8(-64)),2))};
            const __m256i sc[4]={
                _mm256_cvtepi8_epi16(_mm_shuffle_epi8(scales,scale_shuffle(j*4))),
                _mm256_cvtepi8_epi16(_mm_shuffle_epi8(scales,scale_shuffle(j*4+1))),
                _mm256_cvtepi8_epi16(_mm_shuffle_epi8(scales,scale_shuffle(j*4+2))),
                _mm256_cvtepi8_epi16(_mm_shuffle_epi8(scales,scale_shuffle(j*4+3)))};
            for(int col=0;col<2;col++){
                const int8_t *y=ys[col][i].qs+j*128;
                const __m256i p0=_mm256_madd_epi16(sc[0],_mm256_maddubs_epi16(q[0],_mm256_loadu_si256((const __m256i*)y)));
                const __m256i p1=_mm256_madd_epi16(sc[1],_mm256_maddubs_epi16(q[1],_mm256_loadu_si256((const __m256i*)(y+32))));
                const __m256i p2=_mm256_madd_epi16(sc[2],_mm256_maddubs_epi16(q[2],_mm256_loadu_si256((const __m256i*)(y+64))));
                const __m256i p3=_mm256_madd_epi16(sc[3],_mm256_maddubs_epi16(q[3],_mm256_loadu_si256((const __m256i*)(y+96))));
                sums[col]=_mm256_add_epi32(sums[col],_mm256_add_epi32(p0,p1));
                sums[col]=_mm256_add_epi32(sums[col],_mm256_add_epi32(p2,p3));
            }
        }
        for(int col=0;col<2;col++){
            const __m256i correction=_mm256_slli_epi32(_mm256_madd_epi16(_mm256_loadu_si256((const __m256i*)ys[col][i].bsums),scales16),5);
            const float d=ys[col][i].d*scale;
            acc[col]=_mm256_fmadd_ps(_mm256_set1_ps(d),_mm256_cvtepi32_ps(_mm256_sub_epi32(sums[col],correction)),acc[col]);
        }
    }
    out[0] = sum8(acc[0]);
    out[stride] = sum8(acc[1]);
}

#endif

bool ggml_cpu_q6_pair_supported(void) {
#if defined(__AVX2__) && defined(__FMA__)
    return true;
#else
    return false;
#endif
}

void ggml_cpu_q6_pair(int n, float * out, size_t stride,
                      const block_q6_K * x, const block_q8_K * y0, const block_q8_K * y1) {
#if defined(__AVX2__) && defined(__FMA__)
    q6_pair_avx2(n, out, stride, x, y0, y1);
#else
    ggml_vec_dot_q6_K_q8_K(n, out, 0, x, 0, y0, 0, 1);
    ggml_vec_dot_q6_K_q8_K(n, out + stride, 0, x, 0, y1, 0, 1);
#endif
}
