#include "ggml.h"
#include "ggml-cpu.h"
#include "ggml-quants.h"
#include "ggml-cpu/quants.h"
#include <cassert>
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <thread>
#include <vector>
#include <chrono>
extern "C" void q6_pair2(int,float *,size_t,const block_q6_K *,const block_q8_K *,const block_q8_K *);
static double run(bool pair,int m,int n,const block_q6_K*x,const block_q8_K*y,float*out){
 auto start=std::chrono::steady_clock::now();std::vector<std::thread>ts;
 for(int t=0;t<8;t++)ts.emplace_back([=]{const int begin=m*t/8,end=m*(t+1)/8;
  for(int row=begin;row<end;row+=16)for(int col=0;col<4;col+=2)for(int r=row;r<std::min(row+16,end);r++){
   const auto*w=x+r*(n/QK_K);const auto*y0=y+col*(n/QK_K),*y1=y+(col+1)*(n/QK_K);float*s=out+r+col*m;
   if(pair)q6_pair2(n,s,m,w,y0,y1);else{ggml_vec_dot_q6_K_q8_K(n,s,0,w,0,y0,0,1);ggml_vec_dot_q6_K_q8_K(n,s+m,0,w,0,y1,0,1);}
  }
 });for(auto&t:ts)t.join();return std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-start).count();
}
int main(){ggml_cpu_init();const int m=262144,n=2560;uint32_t rng=1234;auto next=[&](){rng=rng*1664525+1013904223;return rng;};
 std::vector<block_q6_K>x(size_t(m)*(n/QK_K));
 // Valid synthetic blocks, direct generation avoids a 2.5GiB float source allocation.
 for(auto &b:x){b.d=ggml_fp32_to_fp16((float((next()>>24)+1))/65536);for(auto&q:b.ql)q=next()>>24;for(auto&q:b.qh)q=next()>>24;for(auto&s:b.scales)s=int(next()>>24)-128;}
 std::vector<float>yf(n*4);for(auto&v:yf)v=float(int(next()>>16)-32768)/32768;std::vector<block_q8_K>y(4*n/QK_K);quantize_row_q8_K_ref(yf.data(),y.data(),4*n);
 std::vector<float>a(size_t(m)*4),b(size_t(m)*4);
 run(false,m,n,x.data(),y.data(),a.data());run(true,m,n,x.data(),y.data(),b.data());assert(!std::memcmp(a.data(),b.data(),a.size()*sizeof(float)));for(auto v:b)assert(std::isfinite(v));
 std::fprintf(stderr,"PASS full projection rows=%d columns=4 k=%d weights=%zu outputs=%zu\n",m,n,x.size()*sizeof(block_q6_K),a.size());
 std::puts("repeat,arm,ms");for(int rep=0;rep<8;rep++)for(int j=0;j<2;j++){bool pair=(rep+j)%2;double ms=run(pair,m,n,x.data(),y.data(),pair?b.data():a.data());assert(!std::memcmp(a.data(),b.data(),a.size()*sizeof(float)));std::printf("%d,%s,%.6f\n",rep,pair?"pair":"reference",ms);std::fflush(stdout);}
}
