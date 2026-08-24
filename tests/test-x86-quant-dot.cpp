#include "ggml-cpu.h"
#include "ggml.h"

#include <cmath>
#include <cstdio>
#include <vector>

static float frand(int i) {
    uint32_t x = (uint32_t) i * 747796405u + 2891336453u;
    x = ((x >> ((x >> 28) + 4)) ^ x) * 277803737u;
    x = (x >> 22) ^ x;
    return ((int) (x % 20001) - 10000) / 1000.0f;
}

static int test_dot(ggml_type lhs, ggml_type rhs, const char * name) {
    const auto * lhs_cpu = ggml_get_type_traits_cpu(lhs);
    const auto * rhs_cpu = ggml_get_type_traits_cpu(rhs);
    const auto * lhs_traits = ggml_get_type_traits(lhs);
    const auto * rhs_traits = ggml_get_type_traits(rhs);
    if (!lhs_cpu || !rhs_cpu || !lhs_traits || !rhs_traits || !lhs_cpu->from_float || !rhs_cpu->from_float || !lhs_cpu->vec_dot) {
        std::fprintf(stderr, "missing cpu traits for %s\n", name);
        return 2;
    }

    for (int n : {32, 64, 96, 128, 256, 4096, 8192}) {
        std::vector<float> x(n), y(n);
        for (int i = 0; i < n; ++i) {
            x[i] = frand(i + 11);
            y[i] = frand(i + 101);
        }
        std::vector<unsigned char> qx(ggml_row_size(lhs, n));
        std::vector<unsigned char> qy(ggml_row_size(rhs, n));
        lhs_cpu->from_float(x.data(), qx.data(), n);
        rhs_cpu->from_float(y.data(), qy.data(), n);

        float got = 0.0f;
        lhs_cpu->vec_dot(n, &got, 0, qx.data(), 0, qy.data(), 0, 1);

        std::vector<float> dx(n), dy(n);
        lhs_traits->to_float(qx.data(), dx.data(), n);
        rhs_traits->to_float(qy.data(), dy.data(), n);
        float ref = 0.0f;
        for (int i = 0; i < n; ++i) {
            ref += dx[i] * dy[i];
        }
        const float err = std::fabs(got - ref) / n;
        if (!(err < 1e-4f)) {
            std::fprintf(stderr, "%s dot mismatch n=%d got=%g ref=%g err/n=%g\n", name, n, got, ref, err);
            return 1;
        }
    }
    return 0;
}

static int test_tq2_f32_dot() {
    const auto * cpu = ggml_get_type_traits_cpu(GGML_TYPE_TQ2_0);
    const auto * traits = ggml_get_type_traits(GGML_TYPE_TQ2_0);
    if (!cpu || !traits || !cpu->from_float || !cpu->vec_dot_f32) {
        std::fprintf(stderr, "missing TQ2_0 F32 dot traits\n");
        return 2;
    }

    for (int n : {256, 4096, 8192}) {
        std::vector<float> x0(n), x1(n), y_rows(2 * n);
        for (int i = 0; i < n; ++i) {
            x0[i] = frand(i + 11);
            x1[i] = frand(i + 31);
            y_rows[i] = frand(i + 101);
            y_rows[n + i] = frand(i + 131);
        }

        const size_t row_size = ggml_row_size(GGML_TYPE_TQ2_0, n);
        std::vector<unsigned char> qx(2 * row_size);
        std::vector<float> dx0(n), dx1(n);
        cpu->from_float(x0.data(), qx.data(), n);
        cpu->from_float(x1.data(), qx.data() + row_size, n);
        traits->to_float(qx.data(), dx0.data(), n);
        traits->to_float(qx.data() + row_size, dx1.data(), n);

        float got_single_y[2] = {};
        cpu->vec_dot_f32(n, got_single_y, 2, qx.data(), row_size, y_rows.data(), 0, 2);
        float got[4] = {};
        cpu->vec_dot_f32(n, got, 2, qx.data(), row_size, y_rows.data(), n * sizeof(float), 2);
        const std::vector<float> * dx[2] = { &dx0, &dx1 };
        for (int iy = 0; iy < 2; ++iy) {
            for (int ix = 0; ix < 2; ++ix) {
                float ref = 0.0f;
                for (int i = 0; i < n; ++i) {
                    ref += (*dx[ix])[i] * y_rows[iy * n + i];
                }
                const float err = std::fabs(got[iy * 2 + ix] - ref) / n;
                const float single_y_err = iy == 0 ? std::fabs(got_single_y[ix] - ref) / n : 0.0f;
                if (!(err < 1e-6f) || !(single_y_err < 1e-6f)) {
                    std::fprintf(stderr, "tq2_0*f32 dot mismatch n=%d x=%d y=%d got=%g got_single_y=%g ref=%g err/n=%g single_y_err/n=%g\n", n, ix, iy, got[iy * 2 + ix], got_single_y[ix], ref, err, single_y_err);
                    return 1;
                }
            }
        }
    }
    return 0;
}

int main() {
    ggml_cpu_init();
    if (int rc = test_tq2_f32_dot()) {
        return rc;
    }
    if (int rc = test_dot(GGML_TYPE_Q1_0, GGML_TYPE_Q8_0, "q1_0*q8_0")) {
        return rc;
    }
    if (int rc = test_dot(GGML_TYPE_Q4_0, GGML_TYPE_Q8_0, "q4_0*q8_0")) {
        return rc;
    }
    if (int rc = test_dot(GGML_TYPE_Q5_0, GGML_TYPE_Q8_0, "q5_0*q8_0")) {
        return rc;
    }
    if (int rc = test_dot(GGML_TYPE_Q8_0, GGML_TYPE_Q8_0, "q8_0*q8_0")) {
        return rc;
    }
    return 0;
}
