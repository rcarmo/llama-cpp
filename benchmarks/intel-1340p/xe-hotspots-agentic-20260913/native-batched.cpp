#include "llama.h"
#include "ggml-backend.h"
#include "../../projects/llama-cpp/ggml/src/ggml-backend-impl.h"
#include <cstdio>
#include <chrono>
#include <string>
static size_t view_calls=0;
static double view_ms=0;
using view_fn=ggml_backend_buffer_t(*)(ggml_backend_t,ggml_backend_buffer_t,size_t,size_t);
static view_fn real_view;
static void * (*real_lookup)(ggml_backend_reg_t,const char *);
static ggml_backend_buffer_t counted_view(ggml_backend_t b,ggml_backend_buffer_t s,size_t o,size_t n){auto start=std::chrono::steady_clock::now();++view_calls;auto out=real_view(b,s,o,n);view_ms+=std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-start).count();return out;}
static void * lookup(ggml_backend_reg_t r,const char * n){auto p=real_lookup(r,n);if(p&&std::string(n)=="ggml_backend_vk_buffer_cpu_view"){real_view=(view_fn)p;return (void *)counted_view;}return p;}
static ggml_backend_reg_t load_counted(const char * path){auto r=ggml_backend_load(path);if(r){real_lookup=r->iface.get_proc_address;r->iface.get_proc_address=lookup;}return r;}
struct verify_views {~verify_views(){std::fprintf(stderr,"BATCHED views=%zu view_ms=%.3f\n",view_calls,view_ms);GGML_ASSERT(view_calls==2);}};
static verify_views verify;
#define ggml_backend_load load_counted
#include "../../projects/llama-cpp/tests/test-context-handoff.cpp"
#undef ggml_backend_load
