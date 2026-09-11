/** SCRIPT_JDOC:
{"summary":"Create two independently flagged B0 SIMD candidates: score no-unroll and Q4 n4 2x4","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';
const root=import.meta.dir,parent=readFileSync(root+'/patch/sgemm-parent.cpp','utf8');let s=parent;
function replace(a:string,b:string){if(s.split(a).length!==2)throw Error('Nonunique patch');s=s.replace(a,b)}
const start=s.indexOf('    template <int RM, int RN>\n    inline void gemm_bloc'),end=s.indexOf('    NOINLINE void gemm_score3',start);if(start<0||end<0)throw Error('Score helper');const helper=s.slice(start,end).trimEnd().replace('gemm_bloc(int64_t','gemm_bloc_score_nounroll(int64_t').replace('        for (int64_t l = 0; l < k; l += KN) {','        #if defined(__clang__)\n        #pragma clang loop unroll(disable)\n        #endif\n        for (int64_t l = 0; l < k; l += KN) {');
replace('    NOINLINE void gemm_score3(int64_t m) {',helper+'\n\n    NOINLINE void gemm_score3(int64_t m) {\n        static const bool nounroll = std::getenv("GGML_CPU_EXPERIMENTAL_SCORE3_NOUNROLL") && std::strcmp(std::getenv("GGML_CPU_EXPERIMENTAL_SCORE3_NOUNROLL"), "1") == 0;\n        if (nounroll && params->ith == 0 && std::getenv("GGML_CPU_SCORE3_NOUNROLL_TRACE")) std::fprintf(stderr, "SCORE3_NOUNROLL m=%lld k=%lld\\n", (long long)m, (long long)k);');
replace('            for (; ii + 3 <= end; ii += 3) gemm_bloc<3, 4>(ii, 0);','            for (; ii + 3 <= end; ii += 3) {\n                if (nounroll) gemm_bloc_score_nounroll<3, 4>(ii, 0);\n                else gemm_bloc<3, 4>(ii, 0);\n            }');
const qstart=s.indexOf('class tinyBLAS_Q0_AVX');const mat=s.indexOf('    void matmul(int64_t m, int64_t n) {\n        mnpack(0, m, 0, n);\n    }',qstart);if(mat<0)throw Error('Q4 dispatch');const old='    void matmul(int64_t m, int64_t n) {\n        mnpack(0, m, 0, n);\n    }';const candidate=`    void matmul(int64_t m, int64_t n) {
#if defined(__AVX2__) && defined(__F16C__) && VECTOR_REGISTERS == 16
        if constexpr (std::is_same<TA, block_q4_0>::value && std::is_same<TB, block_q8_0>::value) {
            static const bool q4n4 = std::getenv("GGML_CPU_EXPERIMENTAL_Q4_N4_2X4") && std::strcmp(std::getenv("GGML_CPU_EXPERIMENTAL_Q4_N4_2X4"), "1") == 0;
            if (q4n4 && n == 4 && m >= 4 && m % 2 == 0) {
                if (ith == 0 && std::getenv("GGML_CPU_Q4_N4_TRACE")) std::fprintf(stderr, "Q4_N4_2X4 m=%lld n=%lld kblocks=%lld\\n", (long long)m, (long long)n, (long long)k);
                gemmMx4<2>(0, m, 0, n);
                return;
            }
        }
#endif
        mnpack(0, m, 0, n);
    }`;
s=s.slice(0,mat)+s.slice(mat).replace(old,candidate);
writeFileSync(root+'/patch/sgemm.cpp',s);writeFileSync(root+'/patch-identities.json',JSON.stringify({parent_sha256:createHash('sha256').update(parent).digest('hex'),candidate_sha256:createHash('sha256').update(s).digest('hex'),flags:['GGML_CPU_EXPERIMENTAL_SCORE3_NOUNROLL','GGML_CPU_EXPERIMENTAL_Q4_N4_2X4'],scope:'Independent flags; baseline0/0 versus1/0 or0/1, never combine during causal screen. Score tails and value kernels unchanged.'},null,2)+'\n');
