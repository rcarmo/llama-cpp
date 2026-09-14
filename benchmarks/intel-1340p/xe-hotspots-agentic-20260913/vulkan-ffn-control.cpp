#include "ggml.h"
#include "ggml-backend.h"
#include "ggml-cpu.h"
#include "ggml-quants.h"
#include <cassert>
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <vector>
#include <chrono>
#include <iostream>
static std::vector<float> compute(ggml_backend_t backend,int m,int n,int k,const std::vector<uint8_t>&qa,const std::vector<float>&b,const std::vector<float>*reference=nullptr){
 auto*ctx=ggml_init({8*1024*1024,nullptr,true});assert(ctx);auto*a=ggml_new_tensor_2d(ctx,GGML_TYPE_Q4_0,k,m),*y=ggml_new_tensor_2d(ctx,GGML_TYPE_F32,k,n),*z=ggml_mul_mat(ctx,a,y);auto*g=ggml_new_graph(ctx);ggml_build_forward_expand(g,z);auto*buf=ggml_backend_alloc_ctx_tensors(ctx,backend);assert(buf);
 ggml_backend_tensor_set(a,qa.data(),0,qa.size());ggml_backend_tensor_set(y,b.data(),0,b.size()*sizeof(float));assert(ggml_backend_graph_compute(backend,g)==GGML_STATUS_SUCCESS);ggml_backend_synchronize(backend);
 if(reference){std::vector<float>check(m*n);ggml_backend_tensor_get(z,check.data(),0,check.size()*sizeof(float));double err=0,energy=0;for(size_t i=0;i<check.size();i++){assert(std::isfinite(check[i])&&std::isfinite((*reference)[i]));double d=double(check[i])-(*reference)[i];err+=d*d;energy+=double((*reference)[i])*(*reference)[i];}assert(energy>0&&err/energy<=5e-4);std::cout<<"GATE "<<m<<" "<<n<<" "<<k<<" "<<err/energy<<"\n";}
 if(reference)for(int rep=0;rep<8;rep++){auto start=std::chrono::steady_clock::now();for(int i=0;i<4;i++){assert(ggml_backend_graph_compute(backend,g)==GGML_STATUS_SUCCESS);ggml_backend_synchronize(backend);}std::cout<<"TIMING "<<m<<" "<<n<<" "<<k<<" "<<rep<<" "<<std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-start).count()/4<<"\n";}
 std::vector<float>out(m*n);ggml_backend_tensor_get(z,out.data(),0,out.size()*sizeof(float));ggml_backend_buffer_free(buf);ggml_free(ctx);return out;
}
int main(){ggml_backend_load_all();auto*gpu=ggml_backend_init_by_type(GGML_BACKEND_DEVICE_TYPE_IGPU,nullptr);assert(gpu);auto*cpu=ggml_backend_cpu_init();assert(cpu);ggml_backend_cpu_set_n_threads(cpu,2);
 for(auto shape:std::vector<std::vector<int>>{{10240,256,2560},{2560,256,10240}}){int m=shape[0],n=shape[1],k=shape[2];std::vector<float>a(m*k),b(n*k);uint32_t seed=1234;for(auto&v:a){seed=seed*1664525+1013904223;v=float(int(seed>>16)-32768)/32768;}for(auto&v:b){seed=seed*1664525+1013904223;v=float(int(seed>>16)-32768)/32768;}std::vector<uint8_t>qa(m*ggml_row_size(GGML_TYPE_Q4_0,k));quantize_row_q4_0_ref(a.data(),(block_q4_0*)qa.data(),m*k);a.clear();a.shrink_to_fit();
 auto ref=compute(cpu,m,n,k,qa,b),actual=compute(gpu,m,n,k,qa,b,&ref);double err=0,energy=0,maxAbs=0;for(size_t i=0;i<ref.size();i++){assert(std::isfinite(ref[i])&&std::isfinite(actual[i]));double d=double(ref[i])-actual[i];err+=d*d;energy+=double(ref[i])*ref[i];maxAbs=std::max(maxAbs,std::abs(d));}assert(energy>0&&err/energy<=5e-4);std::cout<<"RESULT "<<m<<" "<<n<<" "<<k<<" "<<err/energy<<" "<<maxAbs<<"\n";
 }
 ggml_backend_free(cpu);ggml_backend_free(gpu);
 // All backend owners are freed. Controller stops monitoring before acknowledging process exit.
 std::cout<<"OWNERS_DRAINED"<<std::endl;std::string line;if(!std::getline(std::cin,line)||line!="close")return 2;
}
