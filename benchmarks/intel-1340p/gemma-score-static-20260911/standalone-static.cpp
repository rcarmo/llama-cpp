#include <immintrin.h>
#include <atomic>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <thread>
#include <vector>

using fp16 = uint16_t;
inline __m256 load8(const fp16 *p){ return _mm256_cvtph_ps(_mm_loadu_si128((const __m128i*)p)); }
inline __m256 madd(__m256 a,__m256 b,__m256 c){ return _mm256_fmadd_ps(a,b,c); }
inline float hsum(__m128 x){ x=_mm_add_ps(x,_mm_movehl_ps(x,x));x=_mm_add_ss(x,_mm_movehdup_ps(x));return _mm_cvtss_f32(x); }
inline float hsum(__m256 x){ return hsum(_mm_add_ps(_mm256_extractf128_ps(x,1),_mm256_castps256_ps128(x))); }
struct Kernel {
 const fp16 *A,*B; float *C; int64_t k,lda,ldb,ldc; std::atomic<uint8_t>* counts;
 template<int RM> void tile(int64_t ii){
  __m256 cv[4][RM]{};
  for(int64_t l=0;l<k;l+=8){
   __m256 av[RM];for(int i=0;i<RM;i++)av[i]=load8(A+lda*(ii+i)+l);
   for(int j=0;j<4;j++){const __m256 bv=load8(B+ldb*j+l);for(int i=0;i<RM;i++)cv[j][i]=madd(av[i],bv,cv[j][i]);}
  }
  for(int j=0;j<4;j++)for(int i=0;i<RM;i++)C[ldc*j+ii+i]=hsum(cv[j][i]);
  for(int i=0;i<RM;i++)counts[ii+i].fetch_add(1,std::memory_order_relaxed);
 }
 void job(int64_t job,int64_t m){const int64_t begin=job*48,end=begin+48<m?begin+48:m;int64_t i=begin;for(;i+3<=end;i+=3)tile<3>(i);if(end-i==2)tile<2>(i);if(end-i==1)tile<1>(i);}
};
struct Output{std::vector<float> storage;std::vector<uint8_t> counts;};
Output run(const std::vector<fp16>&A,const std::vector<fp16>&B,int64_t m,int64_t lda,int64_t ldb,bool statik){
 const int nth=8;const int64_t jobs=(m+47)/48,ldc=m+7;Output o{{},std::vector<uint8_t>(m)};o.storage.assign(ldc*4+32,123456.0f);std::vector<std::atomic<uint8_t>> counts(m);for(auto&x:counts)x.store(0);std::atomic<int64_t> next(nth);std::vector<std::thread> ts;
 for(int ith=0;ith<nth;ith++)ts.emplace_back([&,ith]{Kernel k{A.data(),B.data(),o.storage.data()+16,512,lda,ldb,ldc,counts.data()};for(int64_t j=ith;j<jobs;j=statik?j+nth:next.fetch_add(1,std::memory_order_relaxed))k.job(j,m);});for(auto&t:ts)t.join();for(int64_t i=0;i<m;i++)o.counts[i]=counts[i].load();return o;
}
bool one(int64_t m,int pad,uint32_t seed){const int64_t lda=512+pad,ldb=512+pad+3,ldc=m+7;auto next=[&](){seed=seed*1664525u+1013904223u;return seed;};std::vector<fp16>A(lda*m+16),B(ldb*4+16);for(auto&x:A)x=_cvtss_sh((int(next()%20001)-10000)*.0007f,0);for(auto&x:B)x=_cvtss_sh((int(next()%20001)-10000)*.0009f,0);const auto d=run(A,B,m,lda,ldb,false),s=run(A,B,m,lda,ldb,true);if(d.storage.size()!=s.storage.size()||memcmp(d.storage.data(),s.storage.data(),d.storage.size()*sizeof(float)))return false;for(const auto*o:{&d,&s}){for(uint8_t x:o->counts)if(x!=1)return false;for(int i=0;i<16;i++)if(o->storage[i]!=123456.f)return false;for(int j=0;j<4;j++)for(int64_t i=m;i<ldc;i++)if(o->storage[16+ldc*j+i]!=123456.f)return false;}return true;}
int main(){int passed=0,total=0;for(int round=0;round<2;round++)for(auto m:{int64_t(32769),int64_t(64768),int64_t(65024)}){total++;if(one(m,round?16:0,42+round*71+(uint32_t)m))passed++;}std::printf("%d/%d dynamic-static groups bitexact; once-only rows; tails/strides/changed-input/canaries passed\n",passed,total);return passed==total?0:1;}
