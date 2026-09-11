/** SCRIPT_JDOC:
{"summary":"Generate scratch/FMA correctness tests from exact candidate conversion and parent tile loops","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import{readFileSync,writeFileSync}from'node:fs';const root=import.meta.dir,s=readFileSync(root+'/patch/sgemm.cpp','utf8'),p=readFileSync(root+'/patch/sgemm-parent.cpp','utf8');const begin=s.indexOf('        for (int j = 0; j < 4; ++j)'),end=s.indexOf('        static const bool trace',begin);if(begin<0||end<0)throw Error('Conversion');const conversion=s.slice(begin,end);const a=p.indexOf('    template <int RM, int RN>\n    inline void gemm_bloc'),b=p.indexOf('    NOINLINE void gemm_score3',a);if(a<0||b<0)throw Error('Tile');const tile=p.slice(a,b);
const code=`#include <immintrin.h>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <vector>
#include <thread>
#include <atomic>
using ggml_fp16_t=uint16_t;
template<typename V> inline V load(const uint16_t*p){return _mm256_cvtph_ps(_mm_loadu_si128((const __m128i*)p));}
template<typename V> inline V load(const float*p){return _mm256_loadu_ps(p);}
inline __m256 madd(__m256 a,__m256 b,__m256 c){return _mm256_fmadd_ps(a,b,c);}
inline float hsum(__m128 x){x=_mm_add_ps(x,_mm_movehl_ps(x,x));x=_mm_add_ss(x,_mm_movehdup_ps(x));return _mm_cvtss_f32(x);}
inline float hsum(__m256 x){return hsum(_mm_add_ps(_mm256_extractf128_ps(x,1),_mm256_castps256_ps128(x)));}
template<typename TB>struct Tile{using D=__m256;using V=__m256;static constexpr int KN=8;const uint16_t*A;const TB*B;float*C;int64_t k,lda,ldb,ldc;
${tile}
};
void prepare(const uint16_t* B,int64_t ldb,float*query){
${conversion}
}
bool run(int seed,int pad){uint32_t rng=seed;auto next=[&](){rng=rng*1664525u+1013904223u;return rng;};const int k=512,m=17,lda=k+pad,ldb=k+pad+3,ldc=m+5;std::vector<uint16_t>A(lda*m+16),B(ldb*4+16);for(auto&x:A)x=_cvtss_sh((int(next()%20001)-10000)*0.0007f,0);for(int round=0;round<3;round++){for(auto&x:B)x=_cvtss_sh((int(next()%20001)-10000)*0.0009f,0);const auto before=B;struct Scratch{float pre[16];alignas(64)float q[2048];float post[16];} scratch;for(auto&x:scratch.pre)x=123456.f;for(auto&x:scratch.post)x=123456.f;prepare(B.data(),ldb,scratch.q);for(int j=0;j<4;j++)for(int l=0;l<512;l++){const float expected=_cvtsh_ss(B[j*ldb+l]);if(memcmp(&expected,&scratch.q[j*512+l],4))return false;}for(float x:scratch.pre)if(x!=123456.f)return false;for(float x:scratch.post)if(x!=123456.f)return false;if(B!=before)return false;std::vector<float>ref(ldc*4+16,123456.f),out=ref;Tile<uint16_t>old{A.data(),B.data(),ref.data(),k,lda,ldb,ldc};Tile<float>fresh{A.data(),scratch.q,out.data(),k,lda,512,ldc};int i=0;for(;i+3<=m;i+=3){old.template gemm_bloc<3,4>(i,0);fresh.template gemm_bloc<3,4>(i,0);}if(m-i==2){old.template gemm_bloc<2,4>(i,0);fresh.template gemm_bloc<2,4>(i,0);}if(memcmp(ref.data(),out.data(),ref.size()*4))return false;}return true;}
int main(){std::atomic<int>count{0};auto worker=[&](int seed){for(int pad:{0,1,16})if(run(seed,pad))count++;};std::thread a(worker,42),b(worker,113);a.join();b.join();printf("%d/6 groups,18 rounds scratch/tile bitexact,canaries,changedquery,parallel isolation passed\\n",count.load());return count==6?0:1;}
`;writeFileSync(root+'/standalone.cpp',code);
