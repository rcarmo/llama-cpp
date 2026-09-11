#include <immintrin.h>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <cmath>
#include <vector>
using ggml_fp16_t=uint16_t;
inline float hsum(__m128 x){x=_mm_add_ps(x,_mm_movehl_ps(x,x));x=_mm_add_ss(x,_mm_movehdup_ps(x));return _mm_cvtss_f32(x);}
inline float hsum(__m256 x){return hsum(_mm_add_ps(_mm256_extractf128_ps(x,1),_mm256_castps256_ps128(x)));}
struct Kernel{const ggml_fp16_t*A,*B;float*C;int64_t k,lda,ldb,ldc;
    __attribute__((always_inline)) inline void run(int64_t ii) {
        alignas(32) float sums[12][8];
        int64_t offset = 0;
        const int64_t bytes = k * sizeof(ggml_fp16_t);
        asm volatile (
            "vxorps %%ymm0, %%ymm0, %%ymm0\n\t"
            "vxorps %%ymm1, %%ymm1, %%ymm1\n\t"
            "vxorps %%ymm2, %%ymm2, %%ymm2\n\t"
            "vxorps %%ymm3, %%ymm3, %%ymm3\n\t"
            "vxorps %%ymm4, %%ymm4, %%ymm4\n\t"
            "vxorps %%ymm5, %%ymm5, %%ymm5\n\t"
            "vxorps %%ymm6, %%ymm6, %%ymm6\n\t"
            "vxorps %%ymm7, %%ymm7, %%ymm7\n\t"
            "vxorps %%ymm8, %%ymm8, %%ymm8\n\t"
            "vxorps %%ymm9, %%ymm9, %%ymm9\n\t"
            "vxorps %%ymm10, %%ymm10, %%ymm10\n\t"
            "vxorps %%ymm11, %%ymm11, %%ymm11\n\t"
            "1:\n\t"
            "vcvtph2ps (%[a0],%[offset]), %%ymm12\n\t"
            "vcvtph2ps (%[a1],%[offset]), %%ymm13\n\t"
            "vcvtph2ps (%[a2],%[offset]), %%ymm14\n\t"
            "vcvtph2ps (%[b0],%[offset]), %%ymm15\n\t"
            "vfmadd231ps %%ymm15, %%ymm12, %%ymm0\n\t"
            "vfmadd231ps %%ymm15, %%ymm13, %%ymm1\n\t"
            "vfmadd231ps %%ymm15, %%ymm14, %%ymm2\n\t"
            "vcvtph2ps (%[b1],%[offset]), %%ymm15\n\t"
            "vfmadd231ps %%ymm15, %%ymm12, %%ymm3\n\t"
            "vfmadd231ps %%ymm15, %%ymm13, %%ymm4\n\t"
            "vfmadd231ps %%ymm15, %%ymm14, %%ymm5\n\t"
            "vcvtph2ps (%[b2],%[offset]), %%ymm15\n\t"
            "vfmadd231ps %%ymm15, %%ymm12, %%ymm6\n\t"
            "vfmadd231ps %%ymm15, %%ymm13, %%ymm7\n\t"
            "vfmadd231ps %%ymm15, %%ymm14, %%ymm8\n\t"
            "vcvtph2ps (%[b3],%[offset]), %%ymm15\n\t"
            "vfmadd231ps %%ymm15, %%ymm12, %%ymm9\n\t"
            "vfmadd231ps %%ymm15, %%ymm13, %%ymm10\n\t"
            "vfmadd231ps %%ymm15, %%ymm14, %%ymm11\n\t"
            "addq $16, %[offset]\n\t"
            "cmpq %[bytes], %[offset]\n\t"
            "jb 1b\n\t"
            "vmovups %%ymm0, 0(%[out])\n\t"
            "vmovups %%ymm1, 32(%[out])\n\t"
            "vmovups %%ymm2, 64(%[out])\n\t"
            "vmovups %%ymm3, 96(%[out])\n\t"
            "vmovups %%ymm4, 128(%[out])\n\t"
            "vmovups %%ymm5, 160(%[out])\n\t"
            "vmovups %%ymm6, 192(%[out])\n\t"
            "vmovups %%ymm7, 224(%[out])\n\t"
            "vmovups %%ymm8, 256(%[out])\n\t"
            "vmovups %%ymm9, 288(%[out])\n\t"
            "vmovups %%ymm10, 320(%[out])\n\t"
            "vmovups %%ymm11, 352(%[out])\n\t"
            : [offset] "+&r" (offset)
            : [a0] "r" (A + lda * ii), [a1] "r" (A + lda * (ii + 1)), [a2] "r" (A + lda * (ii + 2)),
              [b0] "r" (B), [b1] "r" (B + ldb), [b2] "r" (B + 2 * ldb), [b3] "r" (B + 3 * ldb),
              [bytes] "r" (bytes), [out] "r" (sums)
            : "cc", "memory", "ymm0", "ymm1", "ymm2", "ymm3", "ymm4", "ymm5", "ymm6", "ymm7", "ymm8", "ymm9", "ymm10", "ymm11", "ymm12", "ymm13", "ymm14", "ymm15"
        );
        for (int j = 0; j < 4; ++j)
            for (int i = 0; i < 3; ++i)
                C[ldc * j + ii + i] = hsum(_mm256_load_ps(sums[j * 3 + i]));
    }
};
int main(){uint32_t seed=42;int count=0;for(int pad:{0,3,16})for(int ii:{0,1,5}){const int k=512,lda=k+pad,ldb=k+pad+1,ldc=16;std::vector<uint16_t>a(lda*9+16),b(ldb*4+16);auto fill=[&](auto&v){for(auto&x:v){seed=seed*1664525u+1013904223u;x=_cvtss_sh((int(seed%20001)-10000)*0.0007f,0);}};fill(a);fill(b);std::vector<float>c(ldc*4+16,123456.f),ref=c;Kernel h{a.data(),b.data(),c.data(),k,lda,ldb,ldc};h.run(ii);for(int j=0;j<4;j++)for(int i=0;i<3;i++){__m256 sum=_mm256_setzero_ps();for(int l=0;l<k;l+=8)sum=_mm256_fmadd_ps(_mm256_cvtph_ps(_mm_loadu_si128((const __m128i*)(a.data()+lda*(ii+i)+l))),_mm256_cvtph_ps(_mm_loadu_si128((const __m128i*)(b.data()+ldb*j+l))),sum);ref[ldc*j+ii+i]=hsum(sum);}if(memcmp(c.data(),ref.data(),c.size()*sizeof(float))){printf("FAIL pad=%d ii=%d\n",pad,ii);return 1;}count++;}printf("%d/%d standalone bit-exact and canary cases passed\n",count,count);}
