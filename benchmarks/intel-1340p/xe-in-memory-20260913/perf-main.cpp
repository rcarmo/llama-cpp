#include "llama.h"
#include "ggml-backend.h"
#include "common.h"
#include "speculative.h"
#include "../../../ggml/src/ggml-backend-impl.h"
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iomanip>
#include <map>
#include <string>
#include <vector>

namespace perf {
using clock = std::chrono::steady_clock;
const auto origin=clock::now();
double now(){return std::chrono::duration<double>(clock::now()-origin).count();}
struct event {std::string name;double begin,end;int tokens;};
std::vector<event> events;
std::map<llama_context *,int> contexts;
std::map<llama_model *,int> models;
int loads=0,ctxs=0,emitted=0,source_tokens=0,target_tokens=0;
size_t shared=0,copied=0;
double first=-1,last=-1;
std::string arm;
void * (*lookup)(ggml_backend_reg_t,const char *)=nullptr;
void * no_view(ggml_backend_reg_t reg,const char * name){return std::strcmp(name,"ggml_backend_vk_buffer_cpu_view")==0?nullptr:lookup(reg,name);}
llama_model * load(const char * file,llama_model_params p){double t=now();auto out=llama_model_load_from_file(file,p);int id=loads++;if(out)models[out]=id;events.push_back({"load_"+std::to_string(id),t,now(),0});return out;}
llama_context * init(llama_model * model,llama_context_params p){double t=now();auto out=llama_init_from_model(model,p);int id=ctxs++;if(out)contexts[out]=id;events.push_back({"context_"+std::to_string(id),t,now(),0});return out;}
int decode(llama_context * ctx,llama_batch batch){double t=now();int rc=llama_decode(ctx,batch);int id=contexts.at(ctx);if(id==0)llama_synchronize(ctx);if(id==0)source_tokens+=batch.n_tokens;else if(id==1)target_tokens+=batch.n_tokens;events.push_back({"decode_"+std::to_string(id),t,now(),batch.n_tokens});return rc;}
bool handoff(llama_context * dst,llama_context * src,bool fallback,llama_kv_handoff_result * r){
    auto reg=ggml_backend_reg_by_name("Vulkan");
    if(!reg||!reg->iface.get_proc_address)throw std::runtime_error("Vulkan registry required");
    lookup=reg->iface.get_proc_address;
    struct restore {ggml_backend_reg_t reg;~restore(){reg->iface.get_proc_address=lookup;}} guard{reg};
    if(arm=="copy")reg->iface.get_proc_address=no_view;
    double t=now();bool ok=llama_kv_handoff_cpu(dst,src,fallback,r);events.push_back({"handoff",t,now(),0});
    if(ok){shared=r->shared_bytes;copied=r->copied_bytes;}
    if(ok&&((arm=="share"&&(shared==0||copied!=0))||(arm=="copy"&&(copied==0||shared!=0))))throw std::runtime_error("Unexpected handoff dispatch");
    return ok;
}
void free_ctx(llama_context * c){double t=now();int id=c?contexts.at(c):-1;llama_free(c);events.push_back({"free_context_"+std::to_string(id),t,now(),0});}
void free_model(llama_model * m){double t=now();int id=m?models.at(m):-1;llama_model_free(m);events.push_back({"free_model_"+std::to_string(id),t,now(),0});}
void emitted_token(FILE * stream){double t=now();if(stream==stdout){if(first<0)first=t;last=t;++emitted;}}
void output(int rc){
    const char * path=std::getenv("PERF_METRICS");if(!path)throw std::runtime_error("PERF_METRICS missing");
    std::ofstream f(path);f<<std::setprecision(12)<<"{\"rc\":"<<rc<<",\"arm\":\""<<arm<<"\",\"wall_s\":"<<now()<<",\"first_token_s\":"<<first<<",\"last_token_s\":"<<last<<",\"emitted\":"<<emitted<<",\"source_tokens\":"<<source_tokens<<",\"target_evaluated_tokens\":"<<target_tokens<<",\"shared_bytes\":"<<shared<<",\"copied_bytes\":"<<copied<<",\"events\":[";
    for(size_t i=0;i<events.size();++i){const auto & e=events[i];if(i)f<<',';f<<"{\"name\":\""<<e.name<<"\",\"begin\":"<<e.begin<<",\"end\":"<<e.end<<",\"tokens\":"<<e.tokens<<'}';}f<<"]}\n";if(!f)throw std::runtime_error("Metrics write failed");
}
}
// Reuse the tested caller verbatim; instrument only calls made by this translation unit.
#define main gemma_caller_main
#define llama_model_load_from_file perf::load
#define llama_init_from_model perf::init
#define llama_decode perf::decode
#define llama_kv_handoff_cpu perf::handoff
#define llama_free perf::free_ctx
#define llama_model_free perf::free_model
#include "../../../tools/gemma-hybrid/in-memory.cpp"
#undef main
#undef llama_model_load_from_file
#undef llama_init_from_model
#undef llama_decode
#undef llama_kv_handoff_cpu
#undef llama_free
#undef llama_model_free
extern "C" size_t __real_fwrite(const void *,size_t,size_t,FILE *);
extern "C" size_t __wrap_fwrite(const void * p,size_t s,size_t n,FILE * f){perf::emitted_token(f);return __real_fwrite(p,s,n,f);}
int main(int argc,char ** argv){
    if(argc==2&&std::strcmp(argv[1],"--self-test")==0){
        perf::lookup=[](ggml_backend_reg_t,const char *)->void *{return (void *)uintptr_t(123);};
        if(perf::no_view(nullptr,"ggml_backend_vk_buffer_cpu_view")!=nullptr || perf::no_view(nullptr,"unrelated")!=(void *)uintptr_t(123))return 1;
        const char data='x';std::fwrite(&data,1,1,stdout);std::fwrite(&data,1,1,stderr);
        if(perf::emitted!=1||perf::first<0||perf::last!=perf::first)return 1;
        std::fprintf(stderr,"\\nPASS: exact caller output hook and selective registry fallback gate\\n");return 0;
    }
    const char * a=std::getenv("PERF_ARM");perf::arm=a?a:"";
    if(perf::arm!="share"&&perf::arm!="copy"){std::fprintf(stderr,"PERF_ARM=share|copy required\n");return 2;}
    const int rc=gemma_caller_main(argc,argv);perf::output(rc);return rc;
}
