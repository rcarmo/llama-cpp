/** SCRIPT_JDOC:
{"summary":"Generate register-assigned AVX2 score3 kernel with twelve fixed accumulators and unchanged reduction order","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import { readFileSync,writeFileSync } from 'node:fs';import{createHash}from'node:crypto';
const root=import.meta.dir,parent=readFileSync(root+'/patch/sgemm-parent.cpp','utf8');let s=parent;
const instructions:string[]=[];
for(let i=0;i<12;i++)instructions.push(`vxorps %%ymm${i}, %%ymm${i}, %%ymm${i}`);
instructions.push('1:');
for(let i=0;i<3;i++)instructions.push(`vcvtph2ps (%[a${i}],%[offset]), %%ymm${12+i}`);
for(let j=0;j<4;j++){instructions.push(`vcvtph2ps (%[b${j}],%[offset]), %%ymm15`);for(let i=0;i<3;i++)instructions.push(`vfmadd231ps %%ymm15, %%ymm${12+i}, %%ymm${j*3+i}`);}
instructions.push('addq $16, %[offset]','cmpq %[bytes], %[offset]','jb 1b');
for(let i=0;i<12;i++)instructions.push(`vmovups %%ymm${i}, ${i*32}(%[out])`);
const helper=`#if defined(__x86_64__) && defined(__AVX2__) && defined(__F16C__) && defined(__FMA__) && defined(__GNUC__)
    // Twelve accumulators plus three A vectors and one B vector fill sixteen YMM registers.
    // Exactly one FMA per eight elements per output; stores occur only after the K loop.
    NOINLINE void gemm_bloc_score_registers(int64_t ii) {
        alignas(32) float sums[12][8];
        int64_t offset = 0;
        const int64_t bytes = k * sizeof(ggml_fp16_t);
        asm volatile (
${instructions.map(l=>'            '+JSON.stringify(l+'\n\t')).join('\n')}
            : [offset] "+&r" (offset)
            : [a0] "r" (A + lda * ii), [a1] "r" (A + lda * (ii + 1)), [a2] "r" (A + lda * (ii + 2)),
              [b0] "r" (B), [b1] "r" (B + ldb), [b2] "r" (B + 2 * ldb), [b3] "r" (B + 3 * ldb),
              [bytes] "r" (bytes), [out] "r" (sums)
            : "cc", "memory", ${Array.from({length:16},(_,i)=>'"ymm'+i+'"').join(', ')}
        );
        for (int j = 0; j < 4; ++j)
            for (int i = 0; i < 3; ++i)
                C[ldc * j + ii + i] = hsum(_mm256_load_ps(sums[j * 3 + i]));
    }
#endif

`;
const a='    NOINLINE void gemm_score3(int64_t m) {';if(s.split(a).length!==2)throw Error('Score entry');s=s.replace(a,helper+a+`\n        static const bool registers = std::getenv("GGML_CPU_EXPERIMENTAL_SCORE3_REGISTERS") && std::strcmp(std::getenv("GGML_CPU_EXPERIMENTAL_SCORE3_REGISTERS"), "1") == 0;
        if (registers && params->ith == 0 && std::getenv("GGML_CPU_SCORE3_REGISTERS_TRACE")) std::fprintf(stderr,"SCORE3_REGISTERS m=%lld k=%lld\\n",(long long)m,(long long)k);
`);
const old='            for (; ii + 3 <= end; ii += 3) gemm_bloc<3, 4>(ii, 0);';if(s.split(old).length!==2)throw Error('Tile call');s=s.replace(old,`            for (; ii + 3 <= end; ii += 3) {
#if defined(__x86_64__) && defined(__AVX2__) && defined(__F16C__) && defined(__FMA__) && defined(__GNUC__)
                if constexpr (KN == 8 && std::is_same<TA, ggml_fp16_t>::value && std::is_same<TB, ggml_fp16_t>::value) {
                    if (registers) { gemm_bloc_score_registers(ii); continue; }
                }
#endif
                gemm_bloc<3, 4>(ii, 0);
            }`);
writeFileSync(root+'/patch/sgemm.cpp',s);writeFileSync(root+'/patch-identities.json',JSON.stringify({parent_sha256:createHash('sha256').update(parent).digest('hex'),candidate_sha256:createHash('sha256').update(s).digest('hex'),flag:'GGML_CPU_EXPERIMENTAL_SCORE3_REGISTERS',scope:'Only existing longF16score3gate;noinline3x4helper fixedYMM0..11 accumulators,YMM12..14A,YMM15B. SameFMAorder andexistinghsum; tails/value/Q4 unchanged.'},null,2)+'\n');
