#include "llama.h"
#include "ggml-backend.h"
#include "common.h"
#include "speculative.h"
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

using model_ptr=std::unique_ptr<llama_model,decltype(&llama_model_free)>;
using context_ptr=std::unique_ptr<llama_context,decltype(&llama_free)>;
using sampler_ptr=std::unique_ptr<llama_sampler,decltype(&llama_sampler_free)>;
static void decode(llama_context * ctx,std::vector<llama_token> & tokens,int start,int count, common_speculative * spec=nullptr) {
    auto b=llama_batch_init(count,0,1);
    for(int i=0;i<count;++i) { b.token[i]=tokens[start+i];b.pos[i]=start+i;b.n_seq_id[i]=1;b.seq_id[i][0]=0;b.logits[i]=(i==count-1); }
    b.n_tokens=count;
    int rc=llama_decode(ctx,b);
    bool processed=rc==0 && (!spec || common_speculative_process(spec,b));
    llama_batch_free(b);
    if(!processed)throw std::runtime_error("decode/process failed: "+std::to_string(rc));
}
int main(int argc,char ** argv) {
    if(argc<3) {std::fprintf(stderr,"Usage: %s MODEL.gguf PROMPT [tokens=32] [--copy-only | --mtp ASSISTANT.gguf]\nOpt-in same-process whole-context KV handoff; no state files or service changes.\n",argv[0]);return 2;}
    try {
        int n=argc>3?std::stoi(argv[3]):32;
        bool copy_only=argc>4&&std::strcmp(argv[4],"--copy-only")==0;
        const char * assistant_path=argc==6 && std::strcmp(argv[4],"--mtp")==0?argv[5]:nullptr;
        if(argc>6 || (argc>4 && !copy_only && !assistant_path) || (copy_only && argc!=5))throw std::runtime_error("unknown option");
        if(n<1||n>256)throw std::runtime_error("tokens must be 1..256");
        ggml_backend_load_all();llama_backend_init();
        auto mp=llama_model_default_params();mp.n_gpu_layers=copy_only?0:999;
        model_ptr gpu(llama_model_load_from_file(argv[1],mp),llama_model_free);
        if(!gpu)throw std::runtime_error("source model load failed");
        if(assistant_path){char arch[64]{};llama_model_meta_val_str(gpu.get(),"general.architecture",arch,sizeof(arch));if(std::strcmp(arch,"gemma4")!=0)throw std::runtime_error("MTP handoff requires a Gemma4 target");}
        const auto vocab=llama_model_get_vocab(gpu.get());
        std::string prompt=argv[2];
        if(prompt.size()>1024*1024)throw std::runtime_error("prompt exceeds 1MiB");
        const int needed=-llama_tokenize(vocab,prompt.data(),prompt.size(),nullptr,0,true,true);
        if(needed<1||needed>4096)throw std::runtime_error("prompt must be 1..4096 tokens");
        std::vector<llama_token> history(needed);
        if(llama_tokenize(vocab,prompt.data(),prompt.size(),history.data(),history.size(),true,true)!=needed)throw std::runtime_error("tokenize failed");
        auto cp=llama_context_default_params();
        cp.n_ctx=((needed+n+255)/256)*256;cp.n_batch=256;cp.n_ubatch=256;cp.n_seq_max=1;
        cp.type_k=GGML_TYPE_F16;cp.type_v=GGML_TYPE_F16;cp.flash_attn_type=LLAMA_FLASH_ATTN_TYPE_DISABLED;
        cp.swa_full=false;cp.kv_cpu_shared=!copy_only;cp.n_threads=8;cp.n_threads_batch=16;
        if(assistant_path){cp.n_outputs_max=256;cp.n_outputs_max_per_seq=256;}
        context_ptr src(llama_init_from_model(gpu.get(),cp),llama_free);if(!src)throw std::runtime_error("source context failed");
        sampler_ptr sampler(llama_sampler_chain_init(llama_sampler_chain_default_params()),llama_sampler_free);
        llama_sampler_chain_add(sampler.get(),llama_sampler_init_greedy());
        for(auto token:history)llama_sampler_accept(sampler.get(),token);
        for(int i=0;i<needed;i+=256)decode(src.get(),history,i,std::min(256,needed-i));
        mp.n_gpu_layers=0;
        model_ptr cpu(llama_model_load_from_file(argv[1],mp),llama_model_free);if(!cpu)throw std::runtime_error("CPU model load failed");
        cp.offload_kqv=false;cp.op_offload=false;cp.kv_cpu_shared=false;
        context_ptr dst(llama_init_from_model(cpu.get(),cp),llama_free);if(!dst)throw std::runtime_error("CPU context failed");
        llama_kv_handoff_result result{};
        if(!llama_kv_handoff_cpu(dst.get(),src.get(),true,&result))throw std::runtime_error("KV handoff rejected");
        std::fprintf(stderr,"HANDOFF shared_bytes=%zu copied_bytes=%zu\n",result.shared_bytes,result.copied_bytes);
        src.reset();gpu.reset();
        model_ptr assistant(nullptr,llama_model_free);
        context_ptr draft_ctx(nullptr,llama_free);
        common_speculative_ptr spec;
        common_params_speculative spec_params;
        if(assistant_path){
            assistant.reset(llama_model_load_from_file(assistant_path,mp));if(!assistant)throw std::runtime_error("assistant load failed");
            char arch[64]{};llama_model_meta_val_str(assistant.get(),"general.architecture",arch,sizeof(arch));if(std::strcmp(arch,"gemma4-assistant")!=0)throw std::runtime_error("MTP handoff requires a Gemma4 assistant");
            auto draft_cp=cp;draft_cp.ctx_type=LLAMA_CONTEXT_TYPE_MTP;draft_cp.ctx_other=dst.get();
            const auto pos_before=llama_memory_seq_pos_max(llama_get_memory(dst.get()),0);
            draft_ctx.reset(llama_init_from_model(assistant.get(),draft_cp));if(!draft_ctx)throw std::runtime_error("assistant context failed");
            if(llama_memory_seq_pos_max(llama_get_memory(dst.get()),0)!=pos_before)throw std::runtime_error("assistant changed target KV state");
            spec_params.types={COMMON_SPECULATIVE_TYPE_DRAFT_MTP};spec_params.draft.ctx_tgt=dst.get();spec_params.draft.ctx_dft=draft_ctx.get();spec_params.draft.n_max=3;spec_params.draft.backend_sampling=false;
            spec.reset(common_speculative_init(spec_params,1));if(!spec)throw std::runtime_error("MTP init failed");
        }
        // Outputs belong to a context. Re-evaluation also primes the new assistant's hidden state.
        if(!llama_memory_seq_rm(llama_get_memory(dst.get()),0,needed-1,-1))throw std::runtime_error("last-token rollback failed");
        decode(dst.get(),history,needed-1,1,spec.get());
        if(spec)common_speculative_begin(spec.get(),0,history);
        const auto cpu_vocab=llama_model_get_vocab(cpu.get());
        auto emit=[&](llama_token token){
            std::vector<char> piece(256);int size=llama_token_to_piece(cpu_vocab,token,piece.data(),piece.size(),0,true);
            if(size<0){piece.resize(-size);size=llama_token_to_piece(cpu_vocab,token,piece.data(),piece.size(),0,true);}
            if(size<0)throw std::runtime_error("token piece failed");
            std::fwrite(piece.data(),1,size,stdout);std::fflush(stdout);
        };
        if(!spec){
            for(int i=0;i<n;++i){auto token=llama_sampler_sample(sampler.get(),dst.get(),-1);if(llama_vocab_is_eog(cpu_vocab,token))break;llama_sampler_accept(sampler.get(),token);emit(token);history.push_back(token);decode(dst.get(),history,history.size()-1,1);}
        }else{
            int produced=0,drafted=0,accepted=0;
            auto last=llama_sampler_sample(sampler.get(),dst.get(),-1);
            if(!llama_vocab_is_eog(cpu_vocab,last)){llama_sampler_accept(sampler.get(),last);emit(last);++produced;}
            while(produced<n && !llama_vocab_is_eog(cpu_vocab,last)){
                llama_tokens draft;
                const int past=history.size();
                auto & dp=common_speculative_get_draft_params(spec.get(),0);
                dp.drafting=true;dp.n_max=std::min(3,n-produced-1);dp.pos0=past;dp.id_last=last;dp.prompt=&history;dp.result=&draft;
                if(dp.n_max>0)common_speculative_draft(spec.get());
                drafted+=draft.size();
                auto batch=llama_batch_init(1+draft.size(),0,1);
                batch.n_tokens=1+draft.size();
                for(int i=0;i<batch.n_tokens;++i){batch.token[i]=i?draft[i-1]:last;batch.pos[i]=past+i;batch.n_seq_id[i]=1;batch.seq_id[i][0]=0;batch.logits[i]=1;}
                const int rc=llama_decode(dst.get(),batch);const bool ok=rc==0 && common_speculative_process(spec.get(),batch);llama_batch_free(batch);if(!ok)throw std::runtime_error("MTP target verify failed");
                std::vector<llama_token> ids;
                for(size_t i=0;i<=draft.size();++i){auto token=llama_sampler_sample(sampler.get(),dst.get(),i);llama_sampler_accept(sampler.get(),token);ids.push_back(token);if(llama_vocab_is_eog(cpu_vocab,token)||i==draft.size()||token!=draft[i])break;}
                const int matched=ids.size()-1;accepted+=matched;common_speculative_accept(spec.get(),0,matched);
                for(auto token:ids){history.push_back(last);last=token;if(llama_vocab_is_eog(cpu_vocab,last))break;emit(last);++produced;}
                if(!llama_memory_seq_rm(llama_get_memory(dst.get()),0,history.size(),-1)||!llama_memory_seq_rm(llama_get_memory(draft_ctx.get()),0,history.size(),-1))throw std::runtime_error("MTP rollback failed");
            }
            std::fprintf(stderr,"MTP drafted=%d accepted=%d output=%d\n",drafted,accepted,produced);
        }
        std::puts("");
        spec.reset();draft_ctx.reset();assistant.reset();sampler.reset();dst.reset();cpu.reset();llama_backend_free();
        return 0;
    }catch(const std::exception & e){std::fprintf(stderr,"ERROR: %s\n",e.what());return 1;}
}
