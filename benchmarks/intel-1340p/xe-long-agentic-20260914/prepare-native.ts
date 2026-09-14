/** SCRIPT_JDOC:
{"summary":"Prepare an isolated three-arm persistent agentic caller with fair copied/shared KV control and per-token timing","kind":"mutating","weight":"lightweight","role":"entrypoint"}
*/
import{readFileSync,writeFileSync,existsSync,mkdirSync}from'node:fs';import{strict as assert}from'node:assert';
const root=import.meta.dir,old=root+'/../xe-master-agentic-20260914/agentic-session.cpp';assert.equal(existsSync(root+'/agentic-session.cpp'),false);
let s=readFileSync(old,'utf8');
const replace=(a:string,b:string)=>{assert.equal(s.split(a).length,2,a);s=s.replace(a,()=>b);};
replace('#include "ggml-backend.h"','#include "ggml-backend.h"\n#include "ggml-backend-impl.h"\n#include <cstring>');
replace('struct session {',`// One process owns this registry mutation; restore before any later decode or thread work.
static decltype(ggml_backend_reg_i::get_proc_address) saved_proc=nullptr;
static void * copy_lookup(ggml_backend_reg_t reg,const char * name){return std::strcmp(name,"ggml_backend_vk_buffer_cpu_view")==0?nullptr:saved_proc(reg,name);}
struct copy_scope {
    ggml_backend_reg_t reg=nullptr;
    explicit copy_scope(bool enabled,ggml_backend_reg_t test_reg=nullptr){if(!enabled)return;reg=test_reg?test_reg:ggml_backend_reg_by_name("Vulkan");if(!reg||!reg->iface.get_proc_address||saved_proc)throw std::runtime_error("copy control registry");saved_proc=reg->iface.get_proc_address;reg->iface.get_proc_address=copy_lookup;}
    ~copy_scope(){if(reg){reg->iface.get_proc_address=saved_proc;saved_proc=nullptr;}}
};
static int control_selftest(){
    auto original=+[](ggml_backend_reg_t,const char*)->void*{return reinterpret_cast<void*>(uintptr_t(123));};
    ggml_backend_reg registry{};registry.iface.get_proc_address=original;
    {copy_scope control(true,&registry);
     if(registry.iface.get_proc_address(&registry,"ggml_backend_vk_buffer_cpu_view")!=nullptr||registry.iface.get_proc_address(&registry,"ggml_backend_vk_alloc_cpu_shared_buffer")!=reinterpret_cast<void*>(uintptr_t(123)))return 1;}
    if(saved_proc||registry.iface.get_proc_address!=original)return 2;
    try{copy_scope control(true,&registry);throw std::runtime_error("test unwind");}catch(const std::runtime_error&){}
    if(saved_proc||registry.iface.get_proc_address!=original)return 3;
    {copy_scope control(false,&registry);if(registry.iface.get_proc_address!=original)return 4;}
    std::cout<<"PASS selective view lookup, unchanged allocation procedure and normal/exception restoration"<<std::endl;return 0;
}
struct session {`);
replace('bool cpu_only;','bool cpu_only;\n    bool copy_kv;');
replace('static constexpr int capacity=8192;','static constexpr int capacity=32768;');
replace('session(std::string model,std::string draft,bool cpu):model_path(model),assistant_path(draft),cpu_only(cpu){}','session(std::string model,std::string draft,std::string arm):model_path(model),assistant_path(draft),cpu_only(arm=="cpu"),copy_kv(arm=="copy"){}');
replace('if(!cpu_only && count>4096)','if(!cpu_only && count>8192)');
replace('const auto t=Clock::now();if(!llama_kv_handoff_cpu(dst.get(),ctx.get(),true,&transfer)||transfer.copied_bytes)throw std::runtime_error("shared handoff failed");handoff_ms=seconds(t)*1000;',`const auto t=Clock::now();bool moved=false;{copy_scope control(copy_kv);moved=llama_kv_handoff_cpu(dst.get(),ctx.get(),true,&transfer);}handoff_ms=seconds(t)*1000;
                if(!moved||(copy_kv?(transfer.shared_bytes!=0||transfer.copied_bytes==0):(transfer.shared_bytes==0||transfer.copied_bytes!=0)))throw std::runtime_error("wrong handoff route");`);
replace('std::vector<llama_token> generated;std::string raw;','std::vector<llama_token> generated;std::vector<double> emission_times;std::string raw;');
replace('if(first<0)first=seconds(start);last_time=seconds(start);','const double now=seconds(start);if(first<0)first=now;last_time=now;emission_times.push_back(now);');
replace('{"decode_tps",generated.size()>1?(generated.size()-1)/(last_time-first):0}','{"decode_tps",generated.size()>1?(generated.size()-1)/(last_time-first):0},{"decode_span_s",generated.size()>1?last_time-first:0},{"emission_times",emission_times},{"context_capacity",capacity}');
replace('int main(int argc,char **argv){if(argc==4','int main(int argc,char **argv){if(argc==2&&std::string(argv[1])=="--control-selftest")return control_selftest();if(argc==4');
replace('if(argc<3||argc>4){std::cerr<<"Usage: agentic-session TARGET ASSISTANT [--cpu]\\n";return 2;}try{ggml_backend_load_all();llama_backend_init();session s(argv[1],argv[2],argc==4&&std::string(argv[3])=="--cpu");',`if(argc!=4){std::cerr<<"Usage: agentic-session TARGET ASSISTANT cpu|copy|share\\n";return 2;}try{const std::string arm=argv[3];if(arm!="cpu"&&arm!="copy"&&arm!="share")throw std::runtime_error("arm");ggml_backend_load_all();llama_backend_init();session s(argv[1],argv[2],arm);`);
mkdirSync(root+'/evidence',{recursive:true});writeFileSync(root+'/agentic-session.cpp',s);console.log('Prepared isolated cpu/copy/share caller,32K capacity,unchanged thread/model settings;no compilation');
