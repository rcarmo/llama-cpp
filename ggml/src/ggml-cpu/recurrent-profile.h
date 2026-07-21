#pragma once

#include "ggml.h"

#include <cstddef>
#include <cstdint>

bool ggml_cpu_recurrent_profile_enabled();
int64_t ggml_cpu_recurrent_profile_now_us();

void ggml_cpu_recurrent_profile_copy(
        enum ggml_op op,
        const struct ggml_tensor * src,
        const struct ggml_tensor * dst,
        int ith,
        int nth,
        int64_t elapsed_us);

void ggml_cpu_recurrent_profile_dot_f32(int n);

void ggml_cpu_recurrent_profile_gdn(
        const struct ggml_tensor * dst,
        int ith,
        int64_t elapsed_us);

void ggml_cpu_recurrent_profile_ssm_conv(
        const struct ggml_tensor * dst,
        int ith,
        int64_t elapsed_us);
