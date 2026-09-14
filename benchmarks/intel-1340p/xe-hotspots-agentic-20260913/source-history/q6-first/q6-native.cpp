#include "ggml.h"
#include "ggml-quants.h"
#include "ggml-cpu/quants.h"
#include <cassert>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <thread>
#include <vector>
#include <chrono>
extern "C" void q6_pair2(int,float *,size_t,const block_q6_K *,const block_q8_K *,const block_q8_K *);
static void ref(int n,float *out,size_t stride,const block_q6_K*x,const block_q8_K*y0,const block_q8_K*y1){ggml_vec_dot_q6_K_q8_K(n,out,0,x,0,y0,0,1);ggml_vec_dot_q6_K_q8_K(n,out+stride,0,x,0,y1,0,1);}
static double bench(bool pair,int m,int n,const block_q6_K*x,const block_q8_K*y,float*out,int loops){
    auto start=std::chrono::steady_clock::now();std::vector<std::thread>ts;
    for(int t=0;t<8;t++)ts.emplace_back([=]{for(int j=0;j<loops;j++)for(int row=t;row<m;row+=8)for(int col=0;col<4;col+=2)(pair?q6_pair2:ref)(n,out+row+col*m,m,x+row*(n/QK_K),y+col*(n/QK_K),y+(col+1)*(n/QK_K));});
    for(auto&t:ts)t.join();return std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-start).count()/loops;
}
int main(){auto c=ggml_init({1024*1024,nullptr,false});assert(c);ggml_free(c);int cases=0;
 for(int n:{256,512,768,2560,10240})for(int family=0;family<4;family++){
    std::vector<float>x(n),ys(n*2);uint32_t rng=1234;
    for(int i=0;i<n;i++){rng=1664525*rng+1013904223;x[i]=family==0?0:family==1?std::sin(i*.071)*.3:family==2?float(int(rng>>16)-32768)/1024:((i&1)?1e-4f:30.0f);}
    for(int i=0;i<n*2;i++){rng=1664525*rng+1013904223;ys[i]=family==0?0:float(int(rng>>16)-32768)/4096;}
    std::vector<block_q6_K>qx(n/QK_K);std::vector<block_q8_K>qy(n*2/QK_K);quantize_row_q6_K_ref(x.data(),qx.data(),n);quantize_row_q8_K_ref(ys.data(),qy.data(),n*2);
    float a[4]={111,222,333,444},b[4]={111,222,333,444};ref(n,a,2,qx.data(),qy.data(),qy.data()+n/QK_K);q6_pair2(n,b,2,qx.data(),qy.data(),qy.data()+n/QK_K);
    assert(!std::memcmp(a,b,sizeof(a)));assert(std::isfinite(b[0])&&std::isfinite(b[2]));assert(b[1]==222&&b[3]==444);cases++;
 }
 std::fprintf(stderr,"PASS q6_pair2 exact cases=%d with output stride canaries\n",cases);
 // 4096 rows screens the actual k=2560, n=4 projection without loading 440MiB of weights.
 int m=4096,n=2560;std::vector<float>x(m*n),y(n*4);for(size_t i=0;i<x.size();i++)x[i]=std::sin(i*.013)*.2;for(size_t i=0;i<y.size();i++)y[i]=std::cos(i*.017)*.4;
 std::vector<block_q6_K>qx(m*n/QK_K);std::vector<block_q8_K>qy(n*4/QK_K);quantize_row_q6_K_ref(x.data(),qx.data(),m*n);quantize_row_q8_K_ref(y.data(),qy.data(),n*4);std::vector<float>a(m*4),b(m*4);
 bench(false,m,n,qx.data(),qy.data(),a.data(),1);bench(true,m,n,qx.data(),qy.data(),b.data(),1);assert(!std::memcmp(a.data(),b.data(),a.size()*sizeof(float)));
 std::puts("repeat,arm,ms");for(int r=0;r<8;r++)for(int j=0;j<2;j++){bool pair=(r+j)%2;double ms=bench(pair,m,n,qx.data(),qy.data(),pair?b.data():a.data(),16);assert(!std::memcmp(a.data(),b.data(),a.size()*sizeof(float)));std::printf("%d,%s,%.6f\n",r,pair?"pair":"reference",ms);}
 std::fprintf(stderr,"PASS matrix rows4096 columns4 k2560 exact\n");
}
