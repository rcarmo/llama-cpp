#include <riscv_vector.h>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <random>
#include <vector>

static __attribute__((noinline)) float baseline(float * row, const float * k, const float * q, float delta) {
    size_t left = 128;
    while (left) {
        const size_t vl = __riscv_vsetvl_e32m8(left);
        vfloat32m8_t vr = __riscv_vle32_v_f32m8(row, vl);
        const vfloat32m8_t vk = __riscv_vle32_v_f32m8(k, vl);
        vr = __riscv_vfmacc_vf_f32m8(vr, delta, vk, vl);
        __riscv_vse32_v_f32m8(row, vr, vl);
        row += vl; k += vl; left -= vl;
    }
    row -= 128;
    size_t vl = __riscv_vsetvlmax_e32m8();
    vfloat32m8_t acc = __riscv_vfmv_v_f_f32m8(0.0f, vl);
    for (int i = 0; i < 128; i += (int) vl) {
        const size_t cur = __riscv_vsetvl_e32m8(128 - i);
        acc = __riscv_vfmacc_vv_f32m8_tu(acc,
                __riscv_vle32_v_f32m8(row + i, cur),
                __riscv_vle32_v_f32m8(q + i, cur), cur);
    }
    vl = __riscv_vsetvlmax_e32m8();
    const vfloat32m1_t zero = __riscv_vfmv_v_f_f32m1(0.0f, 1);
    return __riscv_vfmv_f_s_f32m1_f32(__riscv_vfredusum_vs_f32m8_f32m1(acc, zero, vl));
}

static __attribute__((noinline)) float fused(float * row, const float * k, const float * q, float delta) {
    size_t vl = __riscv_vsetvlmax_e32m8();
    vfloat32m8_t acc = __riscv_vfmv_v_f_f32m8(0.0f, vl);
    for (int i = 0; i < 128; i += (int) vl) {
        const size_t cur = __riscv_vsetvl_e32m8(128 - i);
        vfloat32m8_t vr = __riscv_vle32_v_f32m8(row + i, cur);
        const vfloat32m8_t vk = __riscv_vle32_v_f32m8(k + i, cur);
        vr = __riscv_vfmacc_vf_f32m8(vr, delta, vk, cur);
        __riscv_vse32_v_f32m8(row + i, vr, cur);
        acc = __riscv_vfmacc_vv_f32m8_tu(acc, vr, __riscv_vle32_v_f32m8(q + i, cur), cur);
    }
    vl = __riscv_vsetvlmax_e32m8();
    const vfloat32m1_t zero = __riscv_vfmv_v_f_f32m1(0.0f, 1);
    return __riscv_vfmv_f_s_f32m1_f32(__riscv_vfredusum_vs_f32m8_f32m1(acc, zero, vl));
}

using fn_t = float (*)(float *, const float *, const float *, float);
static void bench(const char * name, fn_t fn, std::vector<float> state, const std::vector<float> & k, const std::vector<float> & q, const std::vector<float> & d, int reps) {
    volatile float sink = 0;
    const int rows = (int) d.size();
    auto begin = std::chrono::steady_clock::now();
    for (int rep = 0; rep < reps; ++rep) {
        for (int row = 0; row < rows; ++row) sink += fn(state.data()+row*128, k.data(), q.data(), d[row]);
    }
    auto end = std::chrono::steady_clock::now();
    double ns = std::chrono::duration<double, std::nano>(end-begin).count();
    double calls = (double) rows*reps;
    std::printf("%-9s ns/row=%8.3f rows/s=%9.3f sink=%g\n", name, ns/calls, calls*1e9/ns, (double)sink);
}

int main(int argc, char ** argv) {
    const int reps = argc > 1 ? std::atoi(argv[1]) : 20000;
    std::mt19937 rng(42); std::uniform_real_distribution<float> dist(-0.01f,0.01f);
    std::vector<float> state(128*128), a=state, b=state, k(128), q(128), d(128);
    for (float & v: state) v=dist(rng); a=state; b=state;
    for (float & v: k) v=dist(rng); for (float & v:q) v=dist(rng); for(float & v:d) v=dist(rng);
    float max_out=0, max_state=0;
    for(int r=0;r<128;r++) { float x=baseline(a.data()+r*128,k.data(),q.data(),d[r]); float y=fused(b.data()+r*128,k.data(),q.data(),d[r]); max_out=std::max(max_out,std::abs(x-y)); }
    for(size_t i=0;i<a.size();i++) max_state=std::max(max_state,std::abs(a[i]-b[i]));
    std::printf("max_out=%g max_state=%g\n",max_out,max_state);
    for(int round=0;round<6;round++){ bench("baseline",baseline,state,k,q,d,reps); bench("fused",fused,state,k,q,d,reps); }
}
