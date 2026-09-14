/** SCRIPT_JDOC:
{"summary":"Prepare opt-in isolated GGML CPU Q6 width4 dispatcher and build recipe without production source changes","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import{readFileSync,writeFileSync,mkdirSync}from'node:fs';const root=import.meta.dir,repo='/var/home/agent/workspace/projects/llama-cpp';
let src=readFileSync(repo+'/ggml/src/ggml-cpu/ggml-cpu.c','utf8');
const decl='// precomputed f32 table for f16 (256 KB) (simd-mappings.h)';if(src.split(decl).length!==2)throw Error('Declaration anchor');
src=src.replace(decl,`static bool xe_q6_pair_enabled = false;
static bool xe_q6_pair_trace = false;
void q6_pair2(int n, float * out, size_t stride, const block_q6_K * x, const block_q8_K * y0, const block_q8_K * y1);

${decl}`);
const init='        is_first_call = false;';
if(src.split(init).length!==2)throw Error('Init anchor');src=src.replace(init,`        xe_q6_pair_enabled = getenv("GGML_XE_Q6_PAIR") && atoi(getenv("GGML_XE_Q6_PAIR")) == 1;
        xe_q6_pair_trace = getenv("GGML_XE_Q6_TRACE") && atoi(getenv("GGML_XE_Q6_TRACE")) == 1;
${init}`);
const anchor='    // attempt to reduce false-sharing (does not seem to make a difference)';if(src.split(anchor).length!==2)throw Error('Dispatch anchor');
src=src.replace(anchor,`    if (xe_q6_pair_enabled && type == GGML_TYPE_Q6_K && !use_f32 &&
        num_rows_per_vec_dot == 1 && vec_dot_type == GGML_TYPE_Q8_K &&
        ne11 == 4 && ne02 == 1 && ne03 == 1 && ne12 == 1 && ne13 == 1 &&
        ggml_is_contiguous(src0) && ggml_is_contiguous(dst)) {
        if (xe_q6_pair_trace && params->ith == 0) {
            fprintf(stderr, "XE_Q6_DISPATCH m=%lld n=%lld k=%lld rows=%lld:%lld cols=%lld:%lld\\n",
                    (long long) ne01, (long long) ne11, (long long) ne00,
                    (long long) ir0_start, (long long) ir0_end, (long long) ir1_start, (long long) ir1_end);
        }
        for (int64_t row = ir0_start; row < ir0_end; row += 16) {
            int64_t col = ir1_start;
            for (; col + 1 < ir1_end; col += 2) {
                for (int64_t r = row; r < MIN(row + 16, ir0_end); r++) {
                    q6_pair2(ne00, (float *) dst->data + r + col * ne0, ne0,
                             (const block_q6_K *) ((const char *) src0->data + r * nb01),
                             (const block_q8_K *) ((const char *) wdata + col * src1_col_stride),
                             (const block_q8_K *) ((const char *) wdata + (col + 1) * src1_col_stride));
                }
            }
            if (col < ir1_end) {
                for (int64_t r = row; r < MIN(row + 16, ir0_end); r++) {
                    vec_dot(ne00, (float *) dst->data + r + col * ne0, 0,
                            (const char *) src0->data + r * nb01, 0,
                            (const char *) wdata + col * src1_col_stride, 0, 1);
                }
            }
        }
        return;
    }

${anchor}`);
const dir=root+'/q6-dispatch-build';mkdirSync(dir,{recursive:true});writeFileSync(dir+'/ggml-cpu.c',src);
console.log('Prepared isolated opt-in Q6 dispatcher; n1/other types/ranks/F32 precision remain original');
