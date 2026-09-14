/** SCRIPT_JDOC:
{"summary":"Build source for actual packed Q4 n4 kernel with streamed segment dot products","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';const root=import.meta.dir,parent=readFileSync(root+'/patch/repack-parent.cpp','utf8');let s=parent.replace('#include <type_traits>','#include <type_traits>\n#include <cstdio>\n#include <cstdlib>\n#include <cstring>');const needle='void ggml_gemm_q4_0_8x8_q8_0(int n, float * GGML_RESTRICT s, size_t bs, const void * GGML_RESTRICT vx, const void * GGML_RESTRICT vy, int nr, int nc) {';if(s.split(needle).length!==2)throw Error('Packed entry');
const helper=`#if defined(__AVX2__) && defined(__F16C__)
// Stream one 8-element segment at a time instead of retaining all shuffled blocks.
static void gemma_q4_stream4(int n, float * s, size_t bs, const block_q4_0x8 * bstart, const block_q8_0x4 * a, int nc) {
    const int nb = n / 32;
    const __m256i mask = _mm256_set1_epi8(15);
    __m256i lut = _mm256_broadcastsi128_si256(_mm_set_epi8(-1,-2,-3,-4,-5,-6,-7,-8,7,6,5,4,3,2,1,0));
    for (int x = 0; x < nc / 8; ++x) {
        const block_q4_0x8 * b = bstart + x * nb;
        __m256 acc[4] = {};
        for (int ib = 0; ib < nb; ++ib) {
            __m256i out[2][2];
            for (int g = 0; g < 2; ++g) {
                __m256i p00 = _mm256_setzero_si256(), p01 = p00, p10 = p00, p11 = p00;
                #if defined(__clang__)
                #pragma clang loop unroll(disable)
                #endif
                for (int seg = 3; seg >= 0; --seg) {
                    const int offset = (seg & 1) * 64;
                    const __m256i raw0 = _mm256_loadu_si256((const __m256i *)(b[ib].qs + offset));
                    const __m256i raw1 = _mm256_loadu_si256((const __m256i *)(b[ib].qs + offset + 32));
                    __m256i raw = g == 0 ? _mm256_permute2x128_si256(raw0, raw1, 0x20) : _mm256_permute2x128_si256(raw0, raw1, 0x31);
                    if (seg >= 2) raw = _mm256_srli_epi16(raw, 4);
                    const __m256i rhs = _mm256_shuffle_epi8(lut, _mm256_and_si256(raw, mask));
                    const __m256i r0 = _mm256_shuffle_epi32(rhs, 136), r1 = _mm256_shuffle_epi32(rhs, 221);
                    const __m256i lhs = _mm256_loadu_si256((const __m256i *)(a[ib].qs + seg * 32));
                    const __m256i l01 = _mm256_permute2x128_si256(lhs, lhs, 0x00), l23 = _mm256_permute2x128_si256(lhs, lhs, 0x11);
                    p00 = mul_sum_i8_pairs_acc_int32x8(p00, _mm256_shuffle_epi32(l01,160), r0);
                    p01 = mul_sum_i8_pairs_acc_int32x8(p01, _mm256_shuffle_epi32(l01,245), r1);
                    p10 = mul_sum_i8_pairs_acc_int32x8(p10, _mm256_shuffle_epi32(l23,160), r0);
                    p11 = mul_sum_i8_pairs_acc_int32x8(p11, _mm256_shuffle_epi32(l23,245), r1);
                }
                out[g][0] = _mm256_add_epi32(p00,p01);
                out[g][1] = _mm256_add_epi32(p10,p11);
            }
            const __m256i i0 = _mm256_blend_epi32(out[0][0],_mm256_shuffle_epi32(out[1][0],78),204);
            const __m256i i1 = _mm256_blend_epi32(_mm256_shuffle_epi32(out[0][0],78),out[1][0],204);
            const __m256i i2 = _mm256_blend_epi32(out[0][1],_mm256_shuffle_epi32(out[1][1],78),204);
            const __m256i i3 = _mm256_blend_epi32(_mm256_shuffle_epi32(out[0][1],78),out[1][1],204);
            const __m256 col = GGML_F32Cx8_LOAD(b[ib].d);
            const __m128i halves = _mm_loadl_epi64((const __m128i *)a[ib].d);
            const __m128 rows = _mm_cvtph_ps(halves);
            const __m256 row = _mm256_insertf128_ps(_mm256_castps128_ps256(rows), rows, 1);
            acc[0] = _mm256_fmadd_ps(_mm256_cvtepi32_ps(i0),_mm256_mul_ps(col,_mm256_shuffle_ps(row,row,0)),acc[0]);
            acc[1] = _mm256_fmadd_ps(_mm256_cvtepi32_ps(i1),_mm256_mul_ps(col,_mm256_shuffle_ps(row,row,85)),acc[1]);
            acc[2] = _mm256_fmadd_ps(_mm256_cvtepi32_ps(i2),_mm256_mul_ps(col,_mm256_shuffle_ps(row,row,170)),acc[2]);
            acc[3] = _mm256_fmadd_ps(_mm256_cvtepi32_ps(i3),_mm256_mul_ps(col,_mm256_shuffle_ps(row,row,255)),acc[3]);
        }
        for (int r = 0; r < 4; ++r) _mm256_storeu_ps(s + r * bs + x * 8, acc[r]);
    }
}
#endif

`;
s=s.replace(needle,helper+needle+`\n#if defined(__AVX2__) && defined(__F16C__) && !defined(__AVX512F__)
    static const bool stream = std::getenv("GGML_CPU_EXPERIMENTAL_Q4_PACK_STREAM") && std::strcmp(std::getenv("GGML_CPU_EXPERIMENTAL_Q4_PACK_STREAM"), "1") == 0;
    if (stream && nr == 4 && nc > 0 && nc % 8 == 0 && n > 0 && n % 32 == 0) {
        if (std::getenv("GGML_CPU_Q4_PACK_TRACE")) std::fprintf(stderr, "Q4_PACK_STREAM n=%d nr=%d nc=%d\\n",n,nr,nc);
        gemma_q4_stream4(n,s,bs,(const block_q4_0x8 *)vx,(const block_q8_0x4 *)vy,nc);
        return;
    }
#endif
`);
writeFileSync(root+'/patch/repack.cpp',s);writeFileSync(root+'/packed-patch-identities.json',JSON.stringify({parent_revision:'abdbeadfb',parent_sha256:createHash('sha256').update(parent).digest('hex'),candidate_sha256:createHash('sha256').update(s).digest('hex'),flag:'GGML_CPU_EXPERIMENTAL_Q4_PACK_STREAM',scope:'Corrected actualpackedQ4 path; no candidate timings from tinyBLAS branch'},null,2)+'\n');
