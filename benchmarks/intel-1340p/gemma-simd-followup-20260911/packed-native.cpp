// Native packed-layout controls against the existing generic Q4_0/Q8_0 reference.
#include "repack.h"
#include "ggml.h"
#include "ggml-cpu.h"
#include <vector>
#include <cmath>
#include <cstdio>
#include <cstdint>
#include <cstring>
#include <algorithm>
struct Shape { int k, nc, nr, pad; };
int main() {
    ggml_cpu_init();
    ggml_init_params init = { 1024*1024, nullptr, true };
    auto * ctx = ggml_init(init);
    const Shape shapes[] = {{256,2560,4,0},{2560,256,4,0},{10240,2560,4,0},{2560,10240,4,0},{4096,2560,4,0},{2560,4096,4,0},{2048,2560,4,0},{2560,2048,4,0},{2560,512,4,0},{2560,1024,4,0},{32,8,4,0},{64,16,4,0},{96,24,4,7},{2560,32,4,13},{256,32,8,0},{256,32,16,5}};
    uint32_t seed = 42;
    auto rand = [&]() { seed = seed * 1664525U + 1013904223U; return seed; };
    int passed = 0;
    for (const auto & sh : shapes) {
        const int nb=sh.k/32, bs=sh.nc+sh.pad;
        std::vector<block_q4_0x8> b(nb*sh.nc/8);
        std::vector<block_q8_0x4> a(nb*sh.nr/4);
        for(auto & x:b) { for(auto & d:x.d)d=ggml_fp32_to_fp16((int(rand()%201)-100)*0.003f);for(auto & q:x.qs)q=rand()>>24; }
        for(auto & x:a) { for(auto & d:x.d)d=ggml_fp32_to_fp16((int(rand()%201)-100)*0.002f);for(auto & q:x.qs)q=int(rand()%255)-127; }
        std::vector<float> ref(bs*sh.nr+16,123456.0f), out=ref;
        ggml_gemm_q4_0_8x8_q8_0_generic(sh.k,ref.data(),bs,b.data(),a.data(),sh.nr,sh.nc);
        ggml_gemm_q4_0_8x8_q8_0(sh.k,out.data(),bs,b.data(),a.data(),sh.nr,sh.nc);
        double err=0,energy=0,maxerr=0;bool ok=true;
        for(int r=0;r<sh.nr;r++)for(int c=0;c<sh.nc;c++){float x=out[r*bs+c],y=ref[r*bs+c];ok &= std::isfinite(x)&&std::isfinite(y);err+=(x-y)*(x-y);energy+=y*y;maxerr=std::max(maxerr,double(std::abs(x-y)));}
        for(int r=0;r<sh.nr;r++)for(int c=sh.nc;c<bs;c++)ok &= out[r*bs+c]==123456.0f;
        for(int i=bs*sh.nr;i<(int)out.size();i++)ok &= out[i]==123456.0f;
        const double nmse=err/std::max(energy,1e-30);ok &= nmse<=5e-4;
        printf("PACKED k=%d nc=%d nr=%d pad=%d nmse=%.12g maxerr=%.9g pass=%d\n",sh.k,sh.nc,sh.nr,sh.pad,nmse,maxerr,ok);
        if(!ok)return 1;passed++;
    }
    ggml_free(ctx);printf("%d/%d packed cases passed\n",passed,int(sizeof(shapes)/sizeof(*shapes)));return 0;
}
