#include "ggml.h"
#include "ggml-backend.h"
#include "ggml-alloc.h"
#include "ggml-cpu.h"
#include "ggml-quants.h"
#include <cassert>
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <vector>
#include <chrono>
static std::vector<float> compute(ggml_backend_t backend,int m,int n,int k,const std::vector<uint8_t>&qa,const std::vector<float>&b){
    ggml_context *ctx=ggml_init({8*1024*1024,nullptr,true});assert(ctx);
    auto*a=ggml_new_tensor_2d(ctx,GGML_TYPE_Q4_0,k,m);auto*y=ggml_new_tensor_2d(ctx,GGML_TYPE_F32,k,n);auto*z=ggml_mul_mat(ctx,a,y);ggml_set_name(a,"probe-q4-ffn");
    auto*g=ggml_new_graph(ctx);ggml_build_forward_expand(g,z);auto*buf=ggml_backend_alloc_ctx_tensors(ctx,backend);assert(buf);
    ggml_backend_tensor_set(a,qa.data(),0,qa.size());ggml_backend_tensor_set(y,b.data(),0,b.size()*sizeof(float));
    const auto start=std::chrono::steady_clock::now();assert(ggml_backend_graph_compute(backend,g)==GGML_STATUS_SUCCESS);ggml_backend_synchronize(backend);
    std::fprintf(stderr,"PROBE compute backend=%s m=%d n=%d k=%d ms=%.3f\n",ggml_backend_name(backend),m,n,k,std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-start).count());
    std::vector<float>out(m*n);ggml_backend_tensor_get(z,out.data(),0,out.size()*sizeof(float));ggml_backend_buffer_free(buf);ggml_free(ctx);return out;
}
int main(){
    ggml_backend_load_all();ggml_backend_t gpu=ggml_backend_init_by_type(GGML_BACKEND_DEVICE_TYPE_IGPU,nullptr);if(!gpu)gpu=ggml_backend_init_by_type(GGML_BACKEND_DEVICE_TYPE_GPU,nullptr);assert(gpu);
    ggml_backend_t cpu=ggml_backend_cpu_init();assert(cpu);ggml_backend_cpu_set_n_threads(cpu,2);
    for(auto shape:std::vector<std::vector<int>>{{10240,256,2560},{2560,256,10240}}){
        int m=shape[0],n=shape[1],k=shape[2];std::vector<float>a(m*k),b(n*k);uint32_t seed=1234;
        for(auto&v:a){seed=seed*1664525+1013904223;v=float(int(seed>>16)-32768)/32768;}for(auto&v:b){seed=seed*1664525+1013904223;v=float(int(seed>>16)-32768)/32768;}
        std::vector<uint8_t>qa(m*ggml_row_size(GGML_TYPE_Q4_0,k));quantize_row_q4_0_ref(a.data(),(block_q4_0*)qa.data(),m*k);a.clear();a.shrink_to_fit();
        auto ref=compute(cpu,m,n,k,qa,b),actual=compute(gpu,m,n,k,qa,b);double err=0,energy=0,max_abs=0;
        for(size_t i=0;i<ref.size();i++){assert(std::isfinite(ref[i])&&std::isfinite(actual[i]));double d=double(ref[i])-actual[i];err+=d*d;energy+=double(ref[i])*ref[i];max_abs=std::max(max_abs,std::abs(d));}
        assert(energy>0);double nmse=err/energy;
        std::printf("RESULT m=%d n=%d k=%d nmse=%.9g max_abs=%.9g threshold=0.0005\n",m,n,k,nmse,max_abs);
        // Existing test-backend-ops test_mul_mat NMSE gate, not a relaxed experiment tolerance.
        assert(nmse<=5e-4);
    }
    ggml_backend_free(cpu);ggml_backend_free(gpu);
}
