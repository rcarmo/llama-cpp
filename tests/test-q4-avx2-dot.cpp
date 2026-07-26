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

int main() {
    ggml_cpu_init();
    const auto * q4 = ggml_get_type_traits_cpu(GGML_TYPE_Q4_0);
    const auto * q8 = ggml_get_type_traits_cpu(GGML_TYPE_Q8_0);
    if (!q4 || !q8 || !q4->from_float || !q8->from_float || !q4->vec_dot) {
        std::fprintf(stderr, "missing q4/q8 cpu traits\n");
        return 2;
    }

    for (int n : {32, 64, 96, 128, 256, 4096, 8192}) {
        std::vector<float> x(n), y(n);
        for (int i = 0; i < n; ++i) {
            x[i] = frand(i + 11);
            y[i] = frand(i + 101);
        }
        std::vector<unsigned char> qx(ggml_row_size(GGML_TYPE_Q4_0, n));
        std::vector<unsigned char> qy(ggml_row_size(GGML_TYPE_Q8_0, n));
        q4->from_float(x.data(), qx.data(), n);
        q8->from_float(y.data(), qy.data(), n);

        float got = 0.0f;
        q4->vec_dot(n, &got, 0, qx.data(), 0, qy.data(), 0, 1);

        std::vector<float> dx(n), dy(n);
        ggml_get_type_traits(GGML_TYPE_Q4_0)->to_float(qx.data(), dx.data(), n);
        ggml_get_type_traits(GGML_TYPE_Q8_0)->to_float(qy.data(), dy.data(), n);
        float ref = 0.0f;
        for (int i = 0; i < n; ++i) {
            ref += dx[i] * dy[i];
        }
        const float err = std::fabs(got - ref) / n;
        if (!(err < 1e-4f)) {
            std::fprintf(stderr, "q4_0*q8_0 dot mismatch n=%d got=%g ref=%g err/n=%g\n", n, got, ref, err);
            return 1;
        }
    }
    return 0;
}
