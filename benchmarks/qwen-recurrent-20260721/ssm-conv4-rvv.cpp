#include <riscv_vector.h>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <random>
#include <vector>

constexpr int NR = 8192;
constexpr int NC = 4;
constexpr int NT = 4;
constexpr int NCS = NC - 1 + NT;

static __attribute__((noinline)) void scalar(const float * s, const float * c, float * x) {
    for (int t = 0; t < NT; ++t) {
        for (int ch = 0; ch < NR; ++ch) {
            float sum = 0.0f;
            for (int tap = 0; tap < NC; ++tap) sum += s[tap + ch*NCS + t] * c[tap + ch*NC];
            x[ch + t*NR] = sum;
        }
    }
}

static __attribute__((noinline)) void rvv(const float * s, const float * c, float * x) {
    const ptrdiff_t ss = NCS * (ptrdiff_t) sizeof(float);
    const ptrdiff_t cs = NC  * (ptrdiff_t) sizeof(float);
    for (int t = 0; t < NT; ++t) {
        int ch = 0;
        while (ch < NR) {
            const size_t vl = __riscv_vsetvl_e32m8(NR - ch);
            vfloat32m8_t acc = __riscv_vfmv_v_f_f32m8(0.0f, vl);
            for (int tap = 0; tap < NC; ++tap) {
                const vfloat32m8_t vs = __riscv_vlse32_v_f32m8(s + t + tap + ch*NCS, ss, vl);
                const vfloat32m8_t vc = __riscv_vlse32_v_f32m8(c + tap + ch*NC, cs, vl);
                acc = __riscv_vfmacc_vv_f32m8(acc, vs, vc, vl);
            }
            __riscv_vse32_v_f32m8(x + t*NR + ch, acc, vl);
            ch += vl;
        }
    }
}

using fn_t = void (*)(const float *, const float *, float *);
static void bench(const char * name, fn_t fn, const std::vector<float> & s, const std::vector<float> & c, std::vector<float> & x, int reps) {
    auto begin = std::chrono::steady_clock::now();
    for (int rep=0; rep<reps; ++rep) fn(s.data(), c.data(), x.data());
    auto end = std::chrono::steady_clock::now();
    double us = std::chrono::duration<double, std::micro>(end-begin).count()/reps;
    double checksum=0; for(float v:x) checksum+=v;
    std::printf("%-7s us/call=%8.3f Goutput/s=%7.3f checksum=%g\n",name,us,(NR*NT)/(us*1e3),checksum);
}
int main(int argc,char**argv){
    int reps=argc>1?std::atoi(argv[1]):10000;
    std::mt19937 rng(7);std::uniform_real_distribution<float>d(-1,1);
    std::vector<float>s(NR*NCS),c(NR*NC),a(NR*NT),b(NR*NT);
    for(float&v:s)v=d(rng);for(float&v:c)v=d(rng);
    scalar(s.data(),c.data(),a.data());rvv(s.data(),c.data(),b.data());
    float max_abs=0;for(size_t i=0;i<a.size();++i)max_abs=std::max(max_abs,std::abs(a[i]-b[i]));
    std::printf("max_abs=%g\n",max_abs);
    for(int round=0;round<6;++round){bench("scalar",scalar,s,c,a,reps);bench("rvv",rvv,s,c,b,reps);}
}
