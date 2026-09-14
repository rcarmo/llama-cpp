/** SCRIPT_JDOC:
{"summary":"Prepare exact-rounded query scratch outside existing score3 key jobs; no scheduler/tile change","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';const root=import.meta.dir,parent=readFileSync(root+'/patch/sgemm-parent.cpp','utf8');let s=parent;
const old='    bool matmul_attn4(int64_t m, int64_t n) {';
const methods=`    // Internal entry for already prepared F32 queries. The caller supplies the existing score3 gate.
    void matmul_score_prepared(int64_t m) { gemm_score3(m); }
#if defined(__AVX2__) && defined(__F16C__) && defined(__FMA__)
    NOINLINE bool matmul_score_query_reuse(int64_t m) {
        alignas(64) float query[4 * 512];
        for (int j = 0; j < 4; ++j)
            for (int l = 0; l < 512; l += 8)
                _mm256_store_ps(query + j * 512 + l, _mm256_cvtph_ps(_mm_loadu_si128((const __m128i *)(B + j * ldb + l))));
        static const bool trace = std::getenv("GGML_CPU_SCORE_QUERY_REUSE_TRACE") != nullptr;
        if (trace) std::fprintf(stderr,"SCORE_QUERY_REUSE enter ith=%d nth=%d m=%lld k=512 prepared=2048 bytes=8192 jobs=%lld tiles=%lld\\n",params->ith,params->nth,(long long)m,(long long)((m+47)/48),(long long)(m/3));
        tinyBLAS<8, __m256, __m256, ggml_fp16_t, float, float> prepared{params,512,(const ggml_fp16_t *)A,lda,query,512,(float *)C,ldc};
        prepared.matmul_score_prepared(m);
        if (trace) std::fprintf(stderr,"SCORE_QUERY_REUSE exit ith=%d\\n",params->ith);
        return true;
    }
#endif

`;
if(s.split(old).length!==2)throw Error('Uniqueentry');s=s.replace(old,methods+old);
const call='            gemm_score3(m);\n            return true;';if(s.split(call).length!==2)throw Error('Scorescope');s=s.replace(call,`                if constexpr (std::is_same<TA, ggml_fp16_t>::value && std::is_same<TB, ggml_fp16_t>::value) {
                    static const bool reuse = std::getenv("GGML_CPU_EXPERIMENTAL_SCORE_QUERY_REUSE") && std::strcmp(std::getenv("GGML_CPU_EXPERIMENTAL_SCORE_QUERY_REUSE"), "1") == 0;
                    if (reuse) return matmul_score_query_reuse(m);
                }
`+call);
writeFileSync(root+'/patch/sgemm.cpp',s);const sha=(s:string)=>createHash('sha256').update(s).digest('hex');writeFileSync(root+'/patch-identities.json',JSON.stringify({parent_sha256:sha(parent),candidate_sha256:sha(s),flag:'GGML_CPU_EXPERIMENTAL_SCORE_QUERY_REUSE',scope:'One8KiBthreadprivatescratch/headcall,expandalreadyF16queries,preparedF32ldb512;existing3x4/48rowjob/tailcode unchanged,team barriers unchanged;noinline scope prevents8KiBbaseline frame.'},null,2)+'\n');
