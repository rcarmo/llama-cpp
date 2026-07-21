#include <riscv_vector.h>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <random>
#include <vector>

static __attribute__((noinline)) float dot_current(const float * x, const float * y) {
    size_t vl = __riscv_vsetvlmax_e32m8();
    vfloat32m8_t acc = __riscv_vfmv_v_f_f32m8(0.0f, vl);
    for (int i = 0; i < 128; i += (int) vl) {
        const size_t cur = __riscv_vsetvl_e32m8(128 - i);
        const vfloat32m8_t vx = __riscv_vle32_v_f32m8(x + i, cur);
        const vfloat32m8_t vy = __riscv_vle32_v_f32m8(y + i, cur);
        acc = __riscv_vfmacc_vv_f32m8_tu(acc, vx, vy, cur);
    }
    vl = __riscv_vsetvlmax_e32m8();
    const vfloat32m1_t zero = __riscv_vfmv_v_f_f32m1(0.0f, 1);
    return __riscv_vfmv_f_s_f32m1_f32(__riscv_vfredusum_vs_f32m8_f32m1(acc, zero, vl));
}

static __attribute__((noinline)) float dot_m8_split(const float * x, const float * y) {
    const size_t vl = __riscv_vsetvlmax_e32m8();
    vfloat32m8_t a0 = __riscv_vfmv_v_f_f32m8(0.0f, vl);
    vfloat32m8_t a1 = __riscv_vfmv_v_f_f32m8(0.0f, vl);
    const vfloat32m8_t x0 = __riscv_vle32_v_f32m8(x, vl);
    const vfloat32m8_t y0 = __riscv_vle32_v_f32m8(y, vl);
    const vfloat32m8_t x1 = __riscv_vle32_v_f32m8(x + vl, vl);
    const vfloat32m8_t y1 = __riscv_vle32_v_f32m8(y + vl, vl);
    a0 = __riscv_vfmacc_vv_f32m8(a0, x0, y0, vl);
    a1 = __riscv_vfmacc_vv_f32m8(a1, x1, y1, vl);
    a0 = __riscv_vfadd_vv_f32m8(a0, a1, vl);
    const vfloat32m1_t zero = __riscv_vfmv_v_f_f32m1(0.0f, 1);
    return __riscv_vfmv_f_s_f32m1_f32(__riscv_vfredusum_vs_f32m8_f32m1(a0, zero, vl));
}

static __attribute__((noinline)) float dot_m4x4(const float * x, const float * y) {
    const size_t vl = __riscv_vsetvlmax_e32m4();
    vfloat32m4_t a0 = __riscv_vfmv_v_f_f32m4(0.0f, vl);
    vfloat32m4_t a1 = __riscv_vfmv_v_f_f32m4(0.0f, vl);
    vfloat32m4_t a2 = __riscv_vfmv_v_f_f32m4(0.0f, vl);
    vfloat32m4_t a3 = __riscv_vfmv_v_f_f32m4(0.0f, vl);
    a0 = __riscv_vfmacc_vv_f32m4(a0, __riscv_vle32_v_f32m4(x + 0*vl, vl), __riscv_vle32_v_f32m4(y + 0*vl, vl), vl);
    a1 = __riscv_vfmacc_vv_f32m4(a1, __riscv_vle32_v_f32m4(x + 1*vl, vl), __riscv_vle32_v_f32m4(y + 1*vl, vl), vl);
    a2 = __riscv_vfmacc_vv_f32m4(a2, __riscv_vle32_v_f32m4(x + 2*vl, vl), __riscv_vle32_v_f32m4(y + 2*vl, vl), vl);
    a3 = __riscv_vfmacc_vv_f32m4(a3, __riscv_vle32_v_f32m4(x + 3*vl, vl), __riscv_vle32_v_f32m4(y + 3*vl, vl), vl);
    a0 = __riscv_vfadd_vv_f32m4(a0, a1, vl);
    a2 = __riscv_vfadd_vv_f32m4(a2, a3, vl);
    a0 = __riscv_vfadd_vv_f32m4(a0, a2, vl);
    const vfloat32m1_t zero = __riscv_vfmv_v_f_f32m1(0.0f, 1);
    return __riscv_vfmv_f_s_f32m1_f32(__riscv_vfredusum_vs_f32m4_f32m1(a0, zero, vl));
}

using fn_t = float (*)(const float *, const float *);

static void bench(const char * name, fn_t fn, const std::vector<float> & x, const std::vector<float> & y, int rows, int reps) {
    volatile float sink = 0.0f;
    auto begin = std::chrono::steady_clock::now();
    for (int rep = 0; rep < reps; ++rep) {
        for (int row = 0; row < rows; ++row) {
            sink += fn(x.data() + row*128, y.data() + row*128);
        }
    }
    auto end = std::chrono::steady_clock::now();
    const double ns = std::chrono::duration<double, std::nano>(end - begin).count();
    const double calls = (double) rows * reps;
    std::printf("%-12s ns/call=%8.3f Mcalls/s=%8.3f sink=%g\n", name, ns/calls, calls*1e3/ns, (double) sink);
}

int main(int argc, char ** argv) {
    const int rows = argc > 1 ? std::atoi(argv[1]) : 4096;
    const int reps = argc > 2 ? std::atoi(argv[2]) : 2000;
    std::vector<float> x(rows*128), y(rows*128);
    std::mt19937 rng(12345);
    std::uniform_real_distribution<float> dist(-1.0f, 1.0f);
    for (float & v : x) v = dist(rng);
    for (float & v : y) v = dist(rng);

    double max_abs[3] = {};
    fn_t fns[] = { dot_current, dot_m8_split, dot_m4x4 };
    for (int row = 0; row < rows; ++row) {
        double ref = 0.0;
        for (int i = 0; i < 128; ++i) ref += (double) x[row*128+i] * y[row*128+i];
        for (int j = 0; j < 3; ++j) max_abs[j] = std::max(max_abs[j], std::abs((double) fns[j](x.data()+row*128, y.data()+row*128) - ref));
    }
    std::printf("max_abs current=%g m8_split=%g m4x4=%g\n", max_abs[0], max_abs[1], max_abs[2]);
    for (int round = 0; round < 5; ++round) {
        bench("current", dot_current, x, y, rows, reps);
        bench("m8_split", dot_m8_split, x, y, rows, reps);
        bench("m4x4", dot_m4x4, x, y, rows, reps);
    }
}
