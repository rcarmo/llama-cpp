#include "ggml.h"
#include "ggml-backend.h"
#include "ggml-cpu.h"
#include "ggml-quants.h"
#include "ggml-cpu/quants.h"
#include <cassert>
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <vector>
int main(){
 ggml_backend_t cpu=ggml_backend_cpu_init();assert(cpu);ggml_backend_cpu_set_n_threads(cpu,8);
 for(int n:{1,2,3,4,5})for(int m:{65,4096}){
  const int k=2560;ggml_context*ctx=ggml_init({4*1024*1024,nullptr,true});assert(ctx);auto*x=ggml_new_tensor_2d(ctx,GGML_TYPE_Q6_K,k,m),*y=ggml_new_tensor_2d(ctx,GGML_TYPE_F32,k,n),*z=ggml_mul_mat(ctx,x,y);auto*g=ggml_new_graph(ctx);ggml_build_forward_expand(g,z);auto*buf=ggml_backend_alloc_ctx_tensors(ctx,cpu);assert(buf);
  std::vector<float>xf(m*k),yf(n*k);for(size_t i=0;i<xf.size();i++)xf[i]=std::sin(i*.017)*.3;for(size_t i=0;i<yf.size();i++)yf[i]=std::cos(i*.013)*.5;
  std::vector<block_q6_K>qx(m*k/QK_K);std::vector<block_q8_K>qy(n*k/QK_K);quantize_row_q6_K_ref(xf.data(),qx.data(),m*k);quantize_row_q8_K_ref(yf.data(),qy.data(),n*k);
  ggml_backend_tensor_set(x,qx.data(),0,qx.size()*sizeof(block_q6_K));ggml_backend_tensor_set(y,yf.data(),0,yf.size()*sizeof(float));assert(ggml_backend_graph_compute(cpu,g)==GGML_STATUS_SUCCESS);
  std::vector<float>actual(m*n),expected(m*n);ggml_backend_tensor_get(z,actual.data(),0,actual.size()*sizeof(float));for(int c=0;c<n;c++)for(int r=0;r<m;r++)ggml_vec_dot_q6_K_q8_K(k,expected.data()+r+c*m,0,qx.data()+r*k/QK_K,0,qy.data()+c*k/QK_K,0,1);
  // CPU activation conversion may use a different rounding implementation than reference quantisation.
  double err=0,energy=0;float max_abs=0;for(size_t i=0;i<actual.size();i++){assert(std::isfinite(actual[i])&&std::isfinite(expected[i]));float d=actual[i]-expected[i];err+=double(d)*d;energy+=double(expected[i])*expected[i];max_abs=std::max(max_abs,std::abs(d));}
  std::printf("RESULT m=%d n=%d k=%d nmse=%.9g max_abs=%.9g exact=%d\n",m,n,k,err/energy,max_abs,std::memcmp(actual.data(),expected.data(),actual.size()*sizeof(float))==0);assert(err/energy<=5e-4);
  // Persist outputs for exact off/on comparison under the same backend conversion path.
  char path[80];std::snprintf(path,sizeof(path),"q6-output-%d-%d.bin",m,n);FILE*f=std::fopen(path,"wb");assert(f);std::fwrite(actual.data(),sizeof(float),actual.size(),f);std::fclose(f);
  ggml_backend_buffer_free(buf);ggml_free(ctx);
 }
 ggml_backend_free(cpu);
}
