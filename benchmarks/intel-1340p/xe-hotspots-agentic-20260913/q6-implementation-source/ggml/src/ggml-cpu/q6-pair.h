#pragma once

#include "ggml.h"
#include "ggml-quants.h"

#ifdef __cplusplus
extern "C" {
#endif

// Internal CPU helper; the original one-result vec_dot contract is unchanged.
bool ggml_cpu_q6_pair_supported(void);
void ggml_cpu_q6_pair(int n, float * out, size_t stride,
                     const block_q6_K * x, const block_q8_K * y0, const block_q8_K * y1);

#ifdef __cplusplus
}
#endif
