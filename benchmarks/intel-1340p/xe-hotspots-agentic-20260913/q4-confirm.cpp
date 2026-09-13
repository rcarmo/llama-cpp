#include "ggml.h"
#include "ggml-cpu-impl.h"
#include "ggml-quants.h"
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <thread>
#include <vector>
#include <sched.h>
#define DECLARE(name) extern "C" bool name(const ggml_compute_params *,int64_t,int64_t,int64_t,const void *,int64_t,const void *,int64_t,void *,int64_t,int,int,int);
DECLARE(reference_sgemm)
DECLARE(candidate_sgemm)
DECLARE(diagnostic_sgemm)
extern "C" unsigned long long diagnostic_hits();
using Fn=decltype(&reference_sgemm);
static double run(Fn fn,int m,int n,int k,const void *a,const void *b,float *c,int threads,int iterations,ggml_type type,bool placement=false){
    const auto start=std::chrono::steady_clock::now();std::vector<std::thread> workers;
    for(int i=0;i<threads;i++)workers.emplace_back([=]{
        if(placement){cpu_set_t mask;CPU_ZERO(&mask);GGML_ASSERT(sched_getaffinity(0,sizeof(mask),&mask)==0);std::fprintf(stderr,"PLACEMENT thread=%d cpu=%d allowed_count=%d\n",i,sched_getcpu(),CPU_COUNT(&mask));}
        ggml_compute_params p{};p.ith=i;p.nth=threads;
        for(int j=0;j<iterations;j++)GGML_ASSERT(fn(&p,m,n,k/32,a,k/32,b,k/32,c,m,type,GGML_TYPE_Q8_0,GGML_TYPE_F32));
    });
    for(auto & t:workers)t.join();
    return std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-start).count()/iterations;
}
int main(){
    const int threads=8;auto ctx=ggml_init({1024*1024,nullptr,false});GGML_ASSERT(ctx);ggml_free(ctx);
    std::puts("family,m,n,k,repeat,arm,ms");
    for(int family=0;family<2;family++)for(auto shape:std::vector<std::vector<int>>{{64,1,256},{64,4,256},{65,4,288},{65,2,256},{65,3,256},{65,5,256},{10240,4,2560},{2560,4,10240}}){
        const int m=shape[0],n=shape[1],k=shape[2];std::vector<float>a(m*k),b(n*k);
        uint32_t seed=12345;
        for(size_t i=0;i<a.size();i++){seed=1664525*seed+1013904223;a[i]=family?float(int(seed>>16)-32768)/32768:std::sin(i*.071)*.25;}
        for(size_t i=0;i<b.size();i++){seed=1664525*seed+1013904223;b[i]=family?float(int(seed>>16)-32768)/8192:std::cos(i*.113)*.75;}
        std::vector<uint8_t>qa(m*ggml_row_size(GGML_TYPE_Q4_0,k)),qb(n*ggml_row_size(GGML_TYPE_Q8_0,k));
        quantize_row_q4_0_ref(a.data(),(block_q4_0*)qa.data(),m*k);quantize_row_q8_0_ref(b.data(),(block_q8_0*)qb.data(),n*k);
        std::vector<float>x(m*n,NAN),y(m*n,NAN),z(m*n,NAN);
        if(n==1){ggml_compute_params p{};p.nth=1;for(auto fn:{reference_sgemm,candidate_sgemm,diagnostic_sgemm})GGML_ASSERT(!fn(&p,m,n,k/32,qa.data(),k/32,qb.data(),k/32,x.data(),m,GGML_TYPE_Q4_0,GGML_TYPE_Q8_0,GGML_TYPE_F32));std::fprintf(stderr,"PASS fallback family=%d\n",family);continue;}
        run(reference_sgemm,m,n,k,qa.data(),qb.data(),x.data(),threads,1,GGML_TYPE_Q4_0);
        run(candidate_sgemm,m,n,k,qa.data(),qb.data(),y.data(),threads,1,GGML_TYPE_Q4_0,family==0&&m==10240);
        auto before=diagnostic_hits();run(diagnostic_sgemm,m,n,k,qa.data(),qb.data(),z.data(),threads,1,GGML_TYPE_Q4_0);auto hits=diagnostic_hits()-before;
        GGML_ASSERT(hits==uint64_t(n==4?threads:0));GGML_ASSERT(!std::memcmp(x.data(),y.data(),x.size()*sizeof(float)));GGML_ASSERT(!std::memcmp(x.data(),z.data(),x.size()*sizeof(float)));
        for(auto v:y)GGML_ASSERT(std::isfinite(v));
        std::fprintf(stderr,"PASS exact family=%d m=%d n=%d k=%d hits=%llu\n",family,m,n,k,hits);
        if(m>=2560)for(int r=0;r<8;r++)for(int j=0;j<2;j++){
            int arm=(r+j)%2;double ms=run(arm?candidate_sgemm:reference_sgemm,m,n,k,qa.data(),qb.data(),arm?y.data():x.data(),threads,32,GGML_TYPE_Q4_0);
            GGML_ASSERT(!std::memcmp(x.data(),y.data(),x.size()*sizeof(float)));std::printf("%d,%d,%d,%d,%d,%s,%.6f\n",family,m,n,k,r,arm?"candidate":"reference",ms);std::fflush(stdout);
        }
    }
    // The generic class also serves Q5_0 and Q8_0; these must not enter the Q4 branch.
    for(auto type:{GGML_TYPE_Q5_0,GGML_TYPE_Q8_0}){
        int m=65,n=4,k=256;std::vector<float>a(m*k),b(n*k);for(size_t i=0;i<a.size();i++)a[i]=std::sin(i*.2);for(size_t i=0;i<b.size();i++)b[i]=std::cos(i*.3);
        std::vector<uint8_t>qa(m*ggml_row_size(type,k)),qb(n*ggml_row_size(GGML_TYPE_Q8_0,k));if(type==GGML_TYPE_Q5_0)quantize_row_q5_0_ref(a.data(),(block_q5_0*)qa.data(),m*k);else quantize_row_q8_0_ref(a.data(),(block_q8_0*)qa.data(),m*k);quantize_row_q8_0_ref(b.data(),(block_q8_0*)qb.data(),n*k);
        std::vector<float>x(m*n,NAN),y(m*n,NAN),z(m*n,NAN);run(reference_sgemm,m,n,k,qa.data(),qb.data(),x.data(),threads,1,type);run(candidate_sgemm,m,n,k,qa.data(),qb.data(),y.data(),threads,1,type);auto h=diagnostic_hits();run(diagnostic_sgemm,m,n,k,qa.data(),qb.data(),z.data(),threads,1,type);
        GGML_ASSERT(diagnostic_hits()==h);GGML_ASSERT(!std::memcmp(x.data(),y.data(),x.size()*sizeof(float)));GGML_ASSERT(!std::memcmp(x.data(),z.data(),x.size()*sizeof(float)));for(auto v:y)GGML_ASSERT(std::isfinite(v));std::fprintf(stderr,"PASS unchanged type=%s\n",ggml_type_name(type));
    }
}
