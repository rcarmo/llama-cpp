/** SCRIPT_JDOC:
{"summary":"Prepare isolated fixedshape4query F16 GEMM dispatch patch from retained source","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import{readFileSync,writeFileSync}from'node:fs';
const root=import.meta.dir;let s=readFileSync(root+'/patch/sgemm.cpp','utf8');
if(s.includes('matmul_attn4'))throw Error('Already patched');
const start=s.indexOf('class tinyBLAS {'),end=s.indexOf('class tinyBLAS_RVV',start);let c=s.slice(start,end);
const marker='    bool matmul(int64_t m, int64_t n) {';
c=c.replace(marker,`    bool matmul_attn4(int64_t m, int64_t n) {
        if (n != 4 || m % 16 != 0 || k % KN != 0) return false;
        gemm<2, 4, 8>(m, n, 1);
        return true;
    }

`+marker);s=s.slice(0,start)+c+s.slice(end);
const old=`            tinyBLAS<8, __m256, __m256, ggml_fp16_t, ggml_fp16_t, float> tb{ params, k,
                (const ggml_fp16_t *)A, lda,
                (const ggml_fp16_t *)B, ldb,
                (float *)C, ldc};
            return tb.matmul(m, n);`;
if(s.split(old).length!==2)throw Error('Exact F16 native dispatch notunique');
s=s.replace(old,`        tinyBLAS<8, __m256, __m256, ggml_fp16_t, ggml_fp16_t, float> tb{params, k, (const ggml_fp16_t *)A, lda,
                                                                   (const ggml_fp16_t *)B, ldb, (float *)C, ldc};
#if defined(__AVX2__) && defined(__FMA__)
        const char * mode = std::getenv("GGML_CPU_EXPERIMENTAL_ATTN4");
        if (!params->use_ref && mode != nullptr && std::strcmp(mode, "1") == 0 && n == 4 &&
            ((k == 512 && m >= 32768) || (k >= 32768 && m == 512))) {
            if (params->ith == 0 && std::getenv("GGML_CPU_ATTN4_TRACE") != nullptr) {
                std::fprintf(stderr, "ATTN4_TILE m=%lld n=%lld k=%lld tile=2x4 threads=%d\\n",
                    (long long) m, (long long) n, (long long) k, params->nth);
            }
            return tb.matmul_attn4(m, n);
        }
#endif
        return tb.matmul(m, n);`);
writeFileSync(root+'/patch/sgemm.cpp',s);
