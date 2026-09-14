#include "../../projects/llama-cpp/ggml/include/ggml.h"
#include "../../projects/llama-cpp/ggml/src/ggml-cpu/ggml-cpu-impl.h"
#include "../../projects/llama-cpp/ggml/src/ggml-quants.h"
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <thread>
#include <vector>
extern "C" bool reference_sgemm(const ggml_compute_params *,int64_t,int64_t,int64_t,const void *,int64_t,const void *,int64_t,void *,int64_t,int,int,int);
extern "C" bool candidate_sgemm(const ggml_compute_params *,int64_t,int64_t,int64_t,const void *,int64_t,const void *,int64_t,void *,int64_t,int,int,int);
using Fn=decltype(&reference_sgemm);
static double run(Fn fn,int m,int n,int k,const void * a,const void * b,float * c,int threads,int iterations=1){auto start=std::chrono::steady_clock::now();std::vector<std::thread> workers;for(int i=0;i<threads;i++)workers.emplace_back([=]{ggml_compute_params p{};p.ith=i;p.nth=threads;for(int iter=0;iter<iterations;++iter)GGML_ASSERT(fn(&p,m,n,k/32,a,k/32,b,k/32,c,m,GGML_TYPE_Q4_0,GGML_TYPE_Q8_0,GGML_TYPE_F32));});for(auto & t:workers)t.join();return std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-start).count()/iterations;}
int main(){int threads=std::getenv("Q4_THREADS")?std::atoi(std::getenv("Q4_THREADS")):2;GGML_ASSERT(threads>=1&&threads<=8);auto ctx=ggml_init({1024*1024,nullptr,false});GGML_ASSERT(ctx);ggml_free(ctx);
 std::puts("m,n,k,repeat,arm,ms");
 for(auto shape:std::vector<std::vector<int>>{{64,1,256},{64,4,256},{65,4,288},{65,2,256},{65,3,256},{65,5,256},{10240,4,2560},{2560,4,10240}}){int m=shape[0],n=shape[1],k=shape[2];std::vector<float> a(m*k),b(n*k);for(size_t i=0;i<a.size();i++)a[i]=std::sin(i*.071)*.25;for(size_t i=0;i<b.size();i++)b[i]=std::cos(i*.113)*.75;std::vector<uint8_t> qa(m*ggml_row_size(GGML_TYPE_Q4_0,k)),qb(n*ggml_row_size(GGML_TYPE_Q8_0,k));quantize_row_q4_0_ref(a.data(),(block_q4_0*)qa.data(),m*k);quantize_row_q8_0_ref(b.data(),(block_q8_0*)qb.data(),n*k);std::vector<float> x(m*n),y(m*n);if(n==1){ggml_compute_params p{};p.ith=0;p.nth=1;GGML_ASSERT(!reference_sgemm(&p,m,n,k/32,qa.data(),k/32,qb.data(),k/32,x.data(),m,GGML_TYPE_Q4_0,GGML_TYPE_Q8_0,GGML_TYPE_F32));GGML_ASSERT(!candidate_sgemm(&p,m,n,k/32,qa.data(),k/32,qb.data(),k/32,y.data(),m,GGML_TYPE_Q4_0,GGML_TYPE_Q8_0,GGML_TYPE_F32));std::fprintf(stderr,"PASS width1 unchanged fallback\n");continue;}run(reference_sgemm,m,n,k,qa.data(),qb.data(),x.data(),threads);run(candidate_sgemm,m,n,k,qa.data(),qb.data(),y.data(),threads);GGML_ASSERT(std::memcmp(x.data(),y.data(),x.size()*sizeof(float))==0);for(int r=0;r<8;r++){for(int j=0;j<2;j++){const int arm=(r+j)%2;double ms=run(arm?candidate_sgemm:reference_sgemm,m,n,k,qa.data(),qb.data(),arm?y.data():x.data(),threads,32);std::printf("%d,%d,%d,%d,%s,%.6f\n",m,n,k,r,arm?"2x4":"4x2",ms);}GGML_ASSERT(std::memcmp(x.data(),y.data(),x.size()*sizeof(float))==0);}std::fprintf(stderr,"PASS exact shape %dx%dx%d\n",m,n,k);}
}
